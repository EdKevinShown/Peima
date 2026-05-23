import {
  RRM_ADAPTER_LAYER,
  RRM_MATCHING_READONLY_DISPLAY_SOURCE_VERSIONS,
  RRM_SOURCE_VERSION_RANKING_PROPOSAL,
  RRM_SOURCE_VERSION_REGISTRY,
  RRM_SOURCE_VERSION_SIM,
  getRrmSourceVersionMeta,
  isKnownRrmSourceVersion,
} from "../../src/modules/rrm-shared";
import { listRegisteredRrmSourceVersions } from "./support/contract";

describe("RRM sourceVersion registry contract (M5.1-r3)", () => {
  it("every registry entry is known and has consistent meta", () => {
    for (const version of listRegisteredRrmSourceVersions()) {
      expect(isKnownRrmSourceVersion(version)).toBe(true);
      const meta = getRrmSourceVersionMeta(version);
      expect(meta.module.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
      expect([RRM_ADAPTER_LAYER.CORE, RRM_ADAPTER_LAYER.ADAPTER, RRM_ADAPTER_LAYER.CONSUMER]).toContain(
        meta.layer,
      );
      if (meta.layer !== RRM_ADAPTER_LAYER.CORE) {
        expect(meta.runsCoreFormula).toBe(false);
      }
      if (version === RRM_SOURCE_VERSION_SIM) {
        expect(meta.layer).toBe(RRM_ADAPTER_LAYER.CORE);
        expect(meta.runsCoreFormula).toBe(true);
      }
    }
  });

  it("matching readonly display versions are registered", () => {
    for (const v of RRM_MATCHING_READONLY_DISPLAY_SOURCE_VERSIONS) {
      expect(RRM_SOURCE_VERSION_REGISTRY[v]).toBeDefined();
    }
    expect(RRM_MATCHING_READONLY_DISPLAY_SOURCE_VERSIONS).toContain(RRM_SOURCE_VERSION_SIM);
    expect(getRrmSourceVersionMeta(RRM_SOURCE_VERSION_RANKING_PROPOSAL).runsCoreFormula).toBe(false);
  });

  it("adapter versions never alias core sim id", () => {
    for (const version of listRegisteredRrmSourceVersions()) {
      const meta = getRrmSourceVersionMeta(version);
      if (meta.layer === RRM_ADAPTER_LAYER.ADAPTER) {
        expect(version).not.toBe(RRM_SOURCE_VERSION_SIM);
      }
    }
  });
});
