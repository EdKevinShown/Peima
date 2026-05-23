import {
  RRM_ADAPTER_LAYER,
  RRM_ADAPTER_UNAVAILABLE_REASONS,
  RRM_SIGNAL_SUMMARY_SCHEMA_VERSION,
  RRM_SOURCE_VERSION_OBSERVED,
  type RrmSignalSummaryBaseV1,
} from "../../src/modules/rrm-shared";
import {
  RRM_SIGNAL_SUMMARY_BASE_V1_KEYS,
  assertRrmSignalSummaryBaseV1,
  isRrmAdapterUnavailableReason,
} from "./support/contract";

function observedSummaryFixture(
  overrides: Partial<RrmSignalSummaryBaseV1> = {},
): RrmSignalSummaryBaseV1 {
  return {
    schemaVersion: RRM_SIGNAL_SUMMARY_SCHEMA_VERSION,
    sourceVersion: RRM_SOURCE_VERSION_OBSERVED,
    layer: RRM_ADAPTER_LAYER.ADAPTER,
    mode: "signal_summary_only",
    fallbackUsed: false,
    insufficientData: false,
    unavailableReason: null,
    generatedAt: "2026-05-23T12:00:00.000Z",
    ...overrides,
  };
}

describe("RrmSignalSummaryBaseV1 contract (M5.1-r3)", () => {
  it("defines stable required keys", () => {
    expect(RRM_SIGNAL_SUMMARY_BASE_V1_KEYS).toHaveLength(8);
    expect(RRM_SIGNAL_SUMMARY_BASE_V1_KEYS).toContain("insufficientData");
    expect(RRM_SIGNAL_SUMMARY_BASE_V1_KEYS).toContain("fallbackUsed");
  });

  it("accepts a valid observed adapter summary", () => {
    const s = observedSummaryFixture();
    expect(() => assertRrmSignalSummaryBaseV1(s)).not.toThrow();
  });

  it("rejects unknown sourceVersion", () => {
    const bad = observedSummaryFixture({ sourceVersion: "rrm-observed-v0" as typeof RRM_SOURCE_VERSION_OBSERVED });
    expect(() => assertRrmSignalSummaryBaseV1(bad)).toThrow(/invalid sourceVersion/);
  });

  it("rejects core layer on signal summary envelope", () => {
    expect(() =>
      assertRrmSignalSummaryBaseV1(
        observedSummaryFixture({ layer: RRM_ADAPTER_LAYER.CORE }),
      ),
    ).toThrow(/adapter or consumer/);
  });

  it("allows insufficient_data with unavailableReason", () => {
    const s = observedSummaryFixture({
      insufficientData: true,
      unavailableReason: "insufficient_data",
      fallbackUsed: true,
    });
    expect(() => assertRrmSignalSummaryBaseV1(s)).not.toThrow();
    expect(isRrmAdapterUnavailableReason("insufficient_data")).toBe(true);
    expect(RRM_ADAPTER_UNAVAILABLE_REASONS).toContain("message_count_below_threshold");
  });
});
