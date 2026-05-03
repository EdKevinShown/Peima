export type M5RrmTop2DisplayEnv = {
  enabled: boolean;
};

/**
 * M5.3-C1: gate for future resolver RRM Top2 display branch (`PEIMA_M5_RRM_TOP2_ENABLED`).
 * Default off — does not change GET display until M5.3-C2 wires resolver.
 */
export function readM5RrmTop2DisplayEnv(): M5RrmTop2DisplayEnv {
  return {
    enabled: process.env.PEIMA_M5_RRM_TOP2_ENABLED === "1",
  };
}
