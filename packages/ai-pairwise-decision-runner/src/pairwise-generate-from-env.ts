import { generateAiPairwiseDecisionCore } from "../../../apps/api/src/modules/ai-pairwise-decision/ai-pairwise-decision-generate.core";
import type { GenerateAiPairwiseDecisionResult } from "../../../apps/api/src/modules/ai-pairwise-decision/ai-pairwise-decision-generate.contracts";
import type { RelationshipShortlistTop2 } from "../../../apps/api/src/modules/ai-pairwise-decision/ai-pairwise-decision.types";
import { completePairwiseDecisionPromptFromEnv } from "./pairwise-env-llm";

function truthyPairwiseEnabled(v: string | undefined): boolean {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function readProvider(): string {
  return (process.env.AI_PAIRWISE_DECISION_PROVIDER ?? "deepseek").trim() || "deepseek";
}

function readApiKey(): string {
  return (process.env.AI_PAIRWISE_DECISION_API_KEY ?? "").trim();
}

function readModel(): string {
  return (process.env.AI_PAIRWISE_DECISION_MODEL ?? "deepseek-v4-flash").trim() || "deepseek-v4-flash";
}

export async function generateAiPairwiseDecisionFromEnv(
  shortlist: RelationshipShortlistTop2,
): Promise<GenerateAiPairwiseDecisionResult> {
  return generateAiPairwiseDecisionCore(
    {
      enabled: truthyPairwiseEnabled(process.env.AI_PAIRWISE_DECISION_ENABLED),
      apiKey: readApiKey(),
      provider: readProvider(),
      model: readModel(),
      complete: (system, user) => completePairwiseDecisionPromptFromEnv(system, user),
    },
    shortlist,
  );
}
