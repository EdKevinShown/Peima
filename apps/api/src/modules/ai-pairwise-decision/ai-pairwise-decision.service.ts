import { Injectable } from "@nestjs/common";
import type { RelationshipShortlistTop2 } from "./ai-pairwise-decision.types";
import { AiPairwiseDecisionConfigService } from "./ai-pairwise-decision.config.service";
import { AiPairwiseDecisionLlmClient } from "./ai-pairwise-decision-llm.client";
import { generateAiPairwiseDecisionCore } from "./ai-pairwise-decision-generate.core";
import type { GenerateAiPairwiseDecisionFailureDetail, GenerateAiPairwiseDecisionResult } from "./ai-pairwise-decision-generate.contracts";

export type { GenerateAiPairwiseDecisionFailureDetail, GenerateAiPairwiseDecisionResult } from "./ai-pairwise-decision-generate.contracts";

@Injectable()
export class AiPairwiseDecisionService {
  constructor(
    private readonly config: AiPairwiseDecisionConfigService,
    private readonly llm: AiPairwiseDecisionLlmClient,
  ) {}

  /**
   * M3.8-M2: call LLM → extract JSON → validate **AiPairwiseDecision**; no DB / no Final Match.
   * On disabled / transport / parse / schema / binding errors returns `ok: false` (no synthetic fallback row).
   */
  async generateAiPairwiseDecision(params: {
    shortlist: RelationshipShortlistTop2;
  }): Promise<GenerateAiPairwiseDecisionResult> {
    const { shortlist } = params;
    return generateAiPairwiseDecisionCore(
      {
        enabled: this.config.enabled,
        apiKey: this.config.apiKey,
        provider: this.config.provider,
        model: this.config.model,
        complete: (system, user) => this.llm.completePairwiseDecisionPrompt(system, user),
      },
      shortlist,
    );
  }
}
