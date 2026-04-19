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
import {
  G1R_PROFILE_KEYS,
  type G1rProfileKey,
  scoreQuestionnaireG1r,
} from "./questionnaire.scorer";

export type QuestionsPayload = {
  version: string;
  questions: ReturnType<typeof getPublicQuestions>;
};

export type SubmitQuestionnaireResult = {
  userId: string;
  answersSaved: number;
  profile: UserProfile;
};

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

  async getProfileForUser(userId: string): Promise<UserProfile> {
    await this.ensureUserExists(userId);

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException(`Profile for user ${userId} not found`);
    }
    return profile;
  }
}
