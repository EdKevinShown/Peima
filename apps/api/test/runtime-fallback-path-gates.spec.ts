/**
 * Runtime gates: production-default env should route to intended primary paths,
 * and explicit opt-out should route to documented fallback paths.
 *
 * Manual verification matrix: docs/testing/backend-qa-and-fallback-manual-guide.md §4
 */
import { SummaryAiConfigService } from "../src/modules/summary-ai/summary-ai.config.service";
import { MatchExplanationAiConfigService } from "../src/modules/match-explanation-ai/match-explanation-ai.config.service";
import { MatchReviewAiConfigService } from "../src/modules/match-review-ai/match-review-ai.config.service";
import { CopilotAiConfigService } from "../src/modules/copilot/copilot-ai.config.service";
import { InteractionSimulationLiteConfigService } from "../src/modules/interaction-simulation-lite/interaction-simulation-lite.config.service";
import { ConversationProfileCompletionAiConfigService } from "../src/modules/chat/conversation-profile-completion-ai.config.service";
import { AiSimulationV1ConfigService } from "../src/modules/ai-simulation-v1/ai-simulation-v1.config.service";
import {
  isPreviewPoolAutoEnsureEnabled,
  isPreviewPoolAutoEnsureSyntheticFallbackEnabled,
} from "../src/modules/preview-pool/preview-pool-auto-ensure.policy";
import { readP76ReadPathEnv } from "../src/modules/matching/p76-read-path-env";
import { readP710R10OldPhotoWriterShutdownReadEnv } from "../src/modules/matching/p710-r10-safe-fallback-final-policy";

function withEnv(
  patch: Record<string, string | undefined>,
  fn: () => void,
): void {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) {
    prev[key] = process.env[key];
    const v = patch[key];
    if (v === undefined) delete process.env[key];
    else process.env[key] = v;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(patch)) {
      const v = prev[key];
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  }
}

describe("runtime fallback path gates (env defaults)", () => {
  describe("preview pool — primary: auto-ensure + synthetic in dev", () => {
    it("auto-ensure enabled by default", () => {
      withEnv(
        {
          PEIMA_PREVIEW_POOL_AUTO_ENSURE_ENABLED: undefined,
          PEIMA_PREVIEW_POOL_AUTO_ENSURE_DISABLED: undefined,
        },
        () => {
          expect(isPreviewPoolAutoEnsureEnabled()).toBe(true);
        },
      );
    });

    it("auto-ensure off when DISABLED=1 (fallback: no lazy create)", () => {
      withEnv({ PEIMA_PREVIEW_POOL_AUTO_ENSURE_DISABLED: "1" }, () => {
        expect(isPreviewPoolAutoEnsureEnabled()).toBe(false);
      });
    });

    it("synthetic fallback enabled by default", () => {
      withEnv(
        {
          PEIMA_PREVIEW_POOL_AUTO_ENSURE_SYNTHETIC_FALLBACK: undefined,
          PEIMA_PREVIEW_POOL_AUTO_ENSURE_SYNTHETIC_DISABLED: undefined,
        },
        () => {
          expect(isPreviewPoolAutoEnsureSyntheticFallbackEnabled()).toBe(true);
        },
      );
    });
  });

  describe("P76 read path — safe fallback ON by default", () => {
    it("P76 read path off without allowlist (primary display = baseline)", () => {
      withEnv(
        {
          PEIMA_P76_READ_PATH_ENABLED: undefined,
          PEIMA_P76_READ_PATH_VIEWER_IDS: undefined,
        },
        () => {
          const env = readP76ReadPathEnv();
          expect(env.enabled).toBe(false);
        },
      );
    });

    it("safe fallback enabled by default when sidecar ineligible", () => {
      withEnv(
        {
          PEIMA_P76_READ_PATH_SAFE_FALLBACK: undefined,
          PEIMA_P76_READ_PATH_SAFE_FALLBACK_LEGACY: undefined,
        },
        () => {
          expect(readP76ReadPathEnv().safeFallbackEnabled).toBe(true);
        },
      );
    });
  });

  describe("P710 legacy writer — shutdown primary in prod-like env", () => {
    it("safe-fallback-final policy blocks legacy writer by default", () => {
      withEnv(
        {
          PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_SHUTDOWN_ENABLED: undefined,
          PEIMA_P710_R9_OLD_PHOTO_MATCHING_WRITER_ENABLED: undefined,
          NODE_ENV: "production",
        },
        () => {
          const p = readP710R10OldPhotoWriterShutdownReadEnv();
          expect(p.writerWritesBlocked).toBe(true);
        },
      );
    });
  });

  describe("AI modules — default OFF => rule/fallback path (explicit opt-in for LLM)", () => {
    it("Summary AI disabled by default (fallback: summary_rule_based)", () => {
      withEnv({ SUMMARY_AI_ENABLED: undefined }, () => {
        const cfg = new SummaryAiConfigService();
        expect(cfg.summaryAiEnabled).toBe(false);
      });
    });

    it("Summary AI enabled when SUMMARY_AI_ENABLED=1", () => {
      withEnv({ SUMMARY_AI_ENABLED: "1" }, () => {
        const cfg = new SummaryAiConfigService();
        expect(cfg.summaryAiEnabled).toBe(true);
      });
    });

    it("Match Explanation AI disabled by default", () => {
      withEnv({ MATCH_EXPLANATION_AI_ENABLED: undefined }, () => {
        const cfg = new MatchExplanationAiConfigService();
        expect(cfg.matchExplanationAiEnabled).toBe(false);
      });
    });

    it("Match Review AI disabled by default", () => {
      withEnv({ MATCH_REVIEW_AI_ENABLED: undefined }, () => {
        const cfg = new MatchReviewAiConfigService();
        expect(cfg.matchReviewAiEnabled).toBe(false);
      });
    });

    it("Copilot AI disabled by default", () => {
      withEnv({ AI_COPILOT_ENABLED: undefined }, () => {
        const cfg = new CopilotAiConfigService();
        expect(cfg.copilotEnabled).toBe(false);
      });
    });

    it("Interaction Simulation Lite disabled by default", () => {
      withEnv({ INTERACTION_SIMULATION_LITE_ENABLED: undefined }, () => {
        const cfg = new InteractionSimulationLiteConfigService();
        expect(cfg.interactionSimulationLiteEnabled).toBe(false);
      });
    });

    it("Profile Completion AI disabled by default", () => {
      withEnv({ PROFILE_COMPLETION_AI_ENABLED: undefined }, () => {
        const cfg = new ConversationProfileCompletionAiConfigService();
        expect(cfg.enabled).toBe(false);
      });
    });

    it("AI Simulation v1 disabled by default", () => {
      withEnv({ AI_SIMULATION_V1_ENABLED: undefined }, () => {
        const cfg = new AiSimulationV1ConfigService();
        expect(cfg.aiSimulationV1Enabled).toBe(false);
      });
    });
  });
});
