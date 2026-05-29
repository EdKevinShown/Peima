/**
 * Strict normalization for v2 `simulationTranscript` items before schema validation.
 * Only fixes common formatting drift; does not invent dialogue or relax the final schema.
 */

export function offendingTypeOfValue(m: unknown): string {
  if (m === null) return "null";
  if (Array.isArray(m)) return "array";
  if (typeof m === "object") return "object";
  return typeof m;
}

function isNonEmptyMessage(s: string): boolean {
  return s.trim().length > 0;
}

/**
 * Normalize a single transcript entry when it matches a known safe pattern.
 * Otherwise returns the input unchanged (validator will reject if still invalid).
 */
export function normalizeOneSimulationTranscriptItem(m: unknown): unknown {
  if (typeof m === "object" && m !== null && !Array.isArray(m)) {
    const mo = m as Record<string, unknown>;
    if (mo.speaker === "viewer" || mo.speaker === "candidate") {
      if (typeof mo.message === "string" && isNonEmptyMessage(mo.message)) {
        return { speaker: mo.speaker, message: mo.message.trim() };
      }
    }
    return m;
  }

  if (typeof m === "string") {
    const t = m.trim();
    const colon = /^(viewer|candidate)\s*[:：]\s*(.+)$/i.exec(t);
    if (colon) {
      const sp = colon[1]!.toLowerCase() as "viewer" | "candidate";
      const msg = colon[2]!.trim();
      if (!isNonEmptyMessage(msg)) {
        return m;
      }
      return { speaker: sp, message: msg };
    }
    return m;
  }

  if (Array.isArray(m) && m.length === 2) {
    const a0 = m[0];
    const a1 = m[1];
    if (a0 === "viewer" || a0 === "candidate") {
      if (typeof a1 === "string" && isNonEmptyMessage(a1)) {
        return { speaker: a0, message: a1.trim() };
      }
    }
    return m;
  }

  return m;
}

/** In-place: mutates `root.scenarioResults[*].simulationTranscript` arrays when present. */
export function normalizeAiSimulationV2PayloadScenarioTranscripts(root: Record<string, unknown>): void {
  const sr = root.scenarioResults;
  if (!Array.isArray(sr)) return;
  for (const raw of sr) {
    if (typeof raw !== "object" || raw === null) continue;
    const o = raw as Record<string, unknown>;
    const msgs = o.simulationTranscript;
    if (!Array.isArray(msgs)) continue;
    o.simulationTranscript = msgs.map((x) => normalizeOneSimulationTranscriptItem(x));
  }
}
