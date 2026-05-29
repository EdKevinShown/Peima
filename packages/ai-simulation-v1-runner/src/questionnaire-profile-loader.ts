/**
 * Builds the same `QuestionnaireProfileView` as `QuestionnaireService.getProfileForUser`, using Prisma only (no Nest).
 */
import type { PrismaClient } from "@peima/database";
import { parseDimensionBranchChatHintsFromUserProfileJson } from "../../../apps/api/src/modules/questionnaire/dimension-branch-chat-hints";
import {
  buildAxisBranchProfilesV3,
  type AxisBranchProfileV3,
} from "../../../apps/api/src/modules/questionnaire/questionnaire.scorer";
import { matchPersonalityLabelsV3 } from "../../../apps/api/src/modules/questionnaire/questionnaire-personality-labels";
import {
  buildOverallExplanation,
  resolveDisplayPrimary,
} from "../../../apps/api/src/modules/questionnaire/questionnaire-overall-explanation";
import type { QuestionnaireProfileView } from "../../../apps/api/src/modules/questionnaire/questionnaire.service";

type DimensionBranchProfilesJson = Record<string, AxisBranchProfileV3>;

function serializeLayer1(profiles: Record<number, AxisBranchProfileV3>): DimensionBranchProfilesJson {
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

export async function loadQuestionnaireProfileViewForAiJob(
  prisma: PrismaClient,
  userId: string,
): Promise<QuestionnaireProfileView> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
  });
  if (!profile) {
    throw new Error(`Profile for user ${userId} not found`);
  }

  const rows = await prisma.questionnaireAnswer.findMany({
    where: { userId },
    orderBy: { updatedAt: "asc" },
  });
  const answers = rows.map((r) => ({
    questionKey: r.questionKey,
    answerValue: r.answerValue,
  }));

  const chatHints = parseDimensionBranchChatHintsFromUserProfileJson(profile.dimensionBranchChatHints);
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
