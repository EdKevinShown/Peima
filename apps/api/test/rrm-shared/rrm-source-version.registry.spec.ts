import {
  RRM_ADAPTER_LAYER,
  RRM_SOURCE_VERSION_OBSERVED,
  RRM_SOURCE_VERSION_SIM,
  assertAdapterSourceVersionNotCoreSim,
  getRrmSourceVersionMeta,
  isKnownRrmSourceVersion,
} from "../../src/modules/rrm-shared";

describe("rrm-source-version.registry (M5.1-r2)", () => {
  it("knows rrm-sim-v1 as core", () => {
    expect(isKnownRrmSourceVersion("rrm-sim-v1")).toBe(true);
    const meta = getRrmSourceVersionMeta(RRM_SOURCE_VERSION_SIM);
    expect(meta.layer).toBe(RRM_ADAPTER_LAYER.CORE);
    expect(meta.runsCoreFormula).toBe(true);
  });

  it("registers observed adapter without reusing sim core version", () => {
    expect(RRM_SOURCE_VERSION_OBSERVED).not.toBe(RRM_SOURCE_VERSION_SIM);
    const meta = getRrmSourceVersionMeta(RRM_SOURCE_VERSION_OBSERVED);
    expect(meta.layer).toBe(RRM_ADAPTER_LAYER.ADAPTER);
    expect(meta.runsCoreFormula).toBe(false);
    expect(() => assertAdapterSourceVersionNotCoreSim(RRM_SOURCE_VERSION_OBSERVED)).not.toThrow();
  });

  it("rejects adapter alias of rrm-sim-v1", () => {
    expect(() => assertAdapterSourceVersionNotCoreSim(RRM_SOURCE_VERSION_SIM)).toThrow(
      /adapter must not use rrm-sim-v1/,
    );
  });

  it("rejects unknown versions", () => {
    expect(isKnownRrmSourceVersion("rrm-sim-v0")).toBe(false);
  });
});
