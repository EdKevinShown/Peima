import {
  attachResultStateToViewerPayload,
  deriveNoRowResultState,
  deriveResultStateForRow,
  mapDisplaySourceCategory,
  P76_RESULT_STATE_CONTRACT_VERSION,
} from "../src/modules/matching/matching-result-state";

describe("matching-result-state (P7.10-r4a)", () => {
  describe("mapDisplaySourceCategory", () => {
    it("maps known displaySourceType values", () => {
      expect(mapDisplaySourceCategory("p76_allowlist_sidecar_readonly")).toBe(
        "p76_sidecar",
      );
      expect(mapDisplaySourceCategory("static_fallback")).toBe("finalize");
      expect(mapDisplaySourceCategory("match_result_original")).toBe(
        "safe_baseline",
      );
    });
  });

  describe("deriveResultStateForRow", () => {
    it("ready when no read-path fallback", () => {
      const r = deriveResultStateForRow({
        displaySourceType: "match_result_original",
        p76ReadPathMeta: { fallbackUsed: false } as never,
      });
      expect(r.resultState).toBe("ready");
      expect(r.safeFallback?.active).toBe(false);
    });

    it("safe_fallback when read path enabled but overlay fell back", () => {
      const r = deriveResultStateForRow({
        displaySourceType: "match_result_original",
        p76ReadPathMeta: {
          enabled: true,
          fallbackUsed: true,
          fallbackReason: "missing_sidecar",
        } as never,
      });
      expect(r.resultState).toBe("safe_fallback");
      expect(r.safeFallback?.active).toBe(true);
      expect(r.safeFallback?.reason).toBe("sidecar_missing");
    });

    it("ready when read path disabled (env_disabled meta only)", () => {
      const r = deriveResultStateForRow({
        displaySourceType: "match_result_original",
        p76ReadPathMeta: {
          enabled: false,
          fallbackUsed: true,
          fallbackReason: "env_disabled",
        } as never,
      });
      expect(r.resultState).toBe("ready");
    });
  });

  describe("deriveNoRowResultState", () => {
    it("waiting → matching_pending", () => {
      const r = deriveNoRowResultState("waiting");
      expect(r.resultState).toBe("matching_pending");
      expect(r.contractVersion).toBe(P76_RESULT_STATE_CONTRACT_VERSION);
      expect(r.queue.status).toBe("waiting");
    });

    it("not_queued → no_result", () => {
      const r = deriveNoRowResultState("not_queued");
      expect(r.resultState).toBe("no_result");
      expect(r.noResult.nextAction).toBe("start_matching");
    });
  });

  describe("attachResultStateToViewerPayload", () => {
    it("adds contractVersion and resultState", () => {
      const out = attachResultStateToViewerPayload({
        displaySourceType: "match_result_original",
      });
      expect(out.contractVersion).toBe(P76_RESULT_STATE_CONTRACT_VERSION);
      expect(out.resultState).toBe("ready");
    });
  });
});
