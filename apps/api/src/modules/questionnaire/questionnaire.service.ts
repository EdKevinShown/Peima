import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { UserProfile } from "@peima/database";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  getQuestionKeys,
  getPublicQuestions,
  getQuestionOrNull,
  QUESTIONNAIRE_VERSION,
} from "./data/questions";
import { SubmitQuestionnaireDto } from "./dto/submit-questionnaire.dto";
import { parseDimensionBranchChatHintsFromUserProfileJson } from "./dimension-branch-chat-hints";
import {
  buildAxisBranchProfilesV3,
  type AxisBranchProfileV3,
  G1R_PROFILE_KEYS,
  type G1rProfileKey,
  scoreQuestionnaireG1r,
} from "./questionnaire.scorer";
import {
  matchPersonalityLabelsV3,
  type DisplayPrimary,
  type PersonalityLabelsResult,
} from "./questionnaire-personality-labels";
import {
  buildOverallExplanation,
  resolveDisplayPrimary,
  type OverallExplanation,
} from "./questionnaire-overall-explanation";

export type QuestionsPayload = {
  version: string;
  questions: ReturnType<typeof getPublicQuestions>;
};

export type SubmitQuestionnaireResult = {
  userId: string;
  answersSaved: number;
  profile: UserProfile;
};

export type DimensionBranchProfilesJson = Record<
  string,
  AxisBranchProfileV3
>;

export type QuestionnaireProfileView = {
  profile: UserProfile;
  /** v3 第一层：各轴 hits / opportunities / rate / adjustedScore + dominant / uncertain */
  dimensionBranchProfiles: DimensionBranchProfilesJson;
  /** 各轴各分支 hits 扁平（便于消费方只读累计） */
  byDimensionBranchScores: Record<string, Record<string, number>>;
  dominantBranches: Record<string, string | null>;
  uncertainBranchesByAxis: Record<string, string[]>;
  labels: PersonalityLabelsResult;
  /** 展示用主标签（永不为空），与 labels.primary（强主）分离 */
  displayPrimary: DisplayPrimary;
  /** 规则拼装的整体解释（非 AI） */
  overallExplanation: OverallExplanation;
};

function serializeLayer1(
  profiles: Record<number, AxisBranchProfileV3>,
): DimensionBranchProfilesJson {
  const out: DimensionBranchProfilesJson = {};
  for (let axis = 1; axis <= 20; axis += 1) {
    out[String(axis)] = profiles[axis];
  }
  return out;
}

function serializeHitsOnly(
  profiles: Record<number, AxisBranchProfileV3>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (let axis = 1; axis <= 20; axis += 1) {
    const row = profiles[axis]?.branches ?? {};
    const o: Record<string, number> = {};
    for (const L of ["A", "B", "C", "D", "E"] as const) {
      o[L] = row[L]?.hits ?? 0;
    }
    out[String(axis)] = o;
  }
  return out;
}

function serializeDominantBranches(
  profiles: Record<number, AxisBranchProfileV3>,
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (let axis = 1; axis <= 20; axis += 1) {
    out[String(axis)] = profiles[axis]?.dominantBranch ?? null;
  }
  return out;
}

function serializeUncertainBranches(
  profiles: Record<number, AxisBranchProfileV3>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (let axis = 1; axis <= 20; axis += 1) {
    out[String(axis)] = [...(profiles[axis]?.uncertainBranches ?? [])];
  }
  return out;
}

@Injectable()
export class QuestionnaireService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }

  private validateAnswersOrThrow(
    answers: SubmitQuestionnaireDto["answers"],
  ): void {
    const keys = answers.map((a) => a.questionKey);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException("duplicate questionKey in answers");
    }

    const expected = [...getQuestionKeys()].sort();
    const got = [...keys].sort();
    if (
      expected.length !== got.length ||
      expected.some((k, i) => k !== got[i])
    ) {
      throw new BadRequestException(
        `answers must match the full current question key set exactly (version ${QUESTIONNAIRE_VERSION}), no duplicates or extras`,
      );
    }

    for (const row of answers) {
      const q = getQuestionOrNull(row.questionKey);
      if (!q) {
        throw new BadRequestException(
          `invalid questionKey: ${row.questionKey}`,
        );
      }
      if (!q.options.some((o) => o.value === row.answerValue)) {
        throw new BadRequestException(
          `invalid answerValue for ${row.questionKey}`,
        );
      }
    }
  }

  getQuestionBank(): QuestionsPayload {
    return {
      version: QUESTIONNAIRE_VERSION,
      questions: getPublicQuestions(),
    };
  }

  async submit(dto: SubmitQuestionnaireDto): Promise<SubmitQuestionnaireResult> {
    await this.ensureUserExists(dto.userId);
    this.validateAnswersOrThrow(dto.answers);

    const scored = scoreQuestionnaireG1r(dto.answers);

    const g1rUpsert = Object.fromEntries(
      G1R_PROFILE_KEYS.map((k) => [k, scored[k]]),
    ) as Record<G1rProfileKey, number | null>;

    const profile = await this.prisma.$transaction(async (tx) => {
      await tx.questionnaireAnswer.deleteMany({
        where: { userId: dto.userId },
      });

      await tx.questionnaireAnswer.createMany({
        data: dto.answers.map((a) => ({
          userId: dto.userId,
          questionKey: a.questionKey,
          answerValue: a.answerValue,
        })),
      });

      return tx.userProfile.upsert({
        where: { userId: dto.userId },
        create: {
          userId: dto.userId,
          ...g1rUpsert,
          confidence: scored.confidence,
        },
        update: {
          ...g1rUpsert,
          confidence: scored.confidence,
        },
      });
    });

    return {
      userId: dto.userId,
      answersSaved: dto.answers.length,
      profile,
    };
  }

  async getProfileForUser(userId: string): Promise<QuestionnaireProfileView> {
    await this.ensureUserExists(userId);

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException(`Profile for user ${userId} not found`);
    }

    const rows = await this.prisma.questionnaireAnswer.findMany({
      where: { userId },
      orderBy: { updatedAt: "asc" },
    });
    const answers = rows.map((r) => ({
      questionKey: r.questionKey,
      answerValue: r.answerValue,
    }));

    const chatHints = parseDimensionBranchChatHintsFromUserProfileJson(
      profile.dimensionBranchChatHints,
    );
    const layer1 = buildAxisBranchProfilesV3(answers, chatHints);
    const labels = matchPersonalityLabelsV3(layer1);
    const displayPrimary = resolveDisplayPrimary(labels);
    const uncertainBranchesByAxis = serializeUncertainBranches(layer1);
    const overallExplanation = buildOverallExplanation({
      labels,
      displayPrimary,
      uncertainBranchesByAxis,
    });

    return {
      profile,
      dimensionBranchProfiles: serializeLayer1(layer1),
      byDimensionBranchScores: serializeHitsOnly(layer1),
      dominantBranches: serializeDominantBranches(layer1),
      uncertainBranchesByAxis,
      labels,
      displayPrimary,
      overallExplanation,
    };
  }
}
