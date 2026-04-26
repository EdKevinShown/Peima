/** v0 contract: docs/P6/truth/P6-final-match-consumption-hint-v0.md */

export const ORCHESTRATION_MVP_SCHEMA_V0 = "post_pool_orchestration_mvp_v0" as const;

const STORAGE_KEY_PREFIX = "peima:finalMatchConsumptionHint:v0:";

export type StoredFinalMatchConsumptionHintV0 = {
  orchestrationSchemaVersion: typeof ORCHESTRATION_MVP_SCHEMA_V0;
  source: "orchestrator_a2";
  poolId: string;
  runMode: string;
  ready: boolean;
  prescreen: {
    candidateCount: number;
    bucketCounts: { promote: number; neutral: number; demote: number };
  };
  aiSimulation: {
    enqueued: boolean;
    simulationJobId?: string;
    acceptedCandidateCount?: number;
  };
  notes?: string[];
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function parseBucketCounts(x: unknown): { promote: number; neutral: number; demote: number } | null {
  if (!isRecord(x)) return null;
  if (!isFiniteNumber(x.promote) || !isFiniteNumber(x.neutral) || !isFiniteNumber(x.demote)) return null;
  return { promote: x.promote, neutral: x.neutral, demote: x.demote };
}

function parsePrescreen(x: unknown): StoredFinalMatchConsumptionHintV0["prescreen"] | null {
  if (!isRecord(x)) return null;
  if (!isFiniteNumber(x.candidateCount)) return null;
  const bucketCounts = parseBucketCounts(x.bucketCounts);
  if (!bucketCounts) return null;
  return { candidateCount: x.candidateCount, bucketCounts };
}

function parseAiSimulation(x: unknown): StoredFinalMatchConsumptionHintV0["aiSimulation"] | null {
  if (!isRecord(x)) return null;
  if (typeof x.enqueued !== "boolean") return null;
  const out: StoredFinalMatchConsumptionHintV0["aiSimulation"] = { enqueued: x.enqueued };
  if (x.simulationJobId != null) {
    if (typeof x.simulationJobId !== "string" || !x.simulationJobId.trim()) return null;
    out.simulationJobId = x.simulationJobId.trim();
  }
  if (x.acceptedCandidateCount !== undefined) {
    if (!isFiniteNumber(x.acceptedCandidateCount)) return null;
    out.acceptedCandidateCount = x.acceptedCandidateCount;
  }
  return out;
}

function parseNotes(x: unknown): string[] | undefined {
  if (x === undefined) return undefined;
  if (!Array.isArray(x)) return undefined;
  if (!x.every((n) => typeof n === "string")) return undefined;
  return x;
}

/**
 * Build sessionStorage key: `peima:finalMatchConsumptionHint:v0:<aiSimJobId>`.
 */
export function buildFinalMatchConsumptionHintStorageKey(aiSimJobId: string): string {
  const id = String(aiSimJobId).trim();
  if (!id) return "";
  return `${STORAGE_KEY_PREFIX}${id}`;
}

/**
 * Extract truth §2 minimal subset from orchestration MVP envelope; returns null if shape invalid.
 */
export function minimalPayloadFromOrchestrationEnvelope(
  envelope: unknown,
): { payload: StoredFinalMatchConsumptionHintV0; simulationJobId: string } | null {
  if (!isRecord(envelope)) return null;
  if (envelope.schemaVersion !== ORCHESTRATION_MVP_SCHEMA_V0) return null;
  const hint = envelope.finalMatchConsumptionHint;
  if (!isRecord(hint)) return null;
  if (hint.source !== "orchestrator_a2") return null;
  if (typeof hint.poolId !== "string" || !hint.poolId.trim()) return null;
  if (typeof hint.runMode !== "string") return null;
  if (typeof hint.ready !== "boolean") return null;
  const prescreen = parsePrescreen(hint.prescreen);
  if (!prescreen) return null;
  const aiSimulation = parseAiSimulation(hint.aiSimulation);
  if (!aiSimulation) return null;
  const simulationJobId = aiSimulation.simulationJobId?.trim();
  if (!simulationJobId) return null;

  const payload: StoredFinalMatchConsumptionHintV0 = {
    orchestrationSchemaVersion: ORCHESTRATION_MVP_SCHEMA_V0,
    source: "orchestrator_a2",
    poolId: hint.poolId.trim(),
    runMode: hint.runMode,
    ready: hint.ready,
    prescreen,
    aiSimulation: {
      enqueued: aiSimulation.enqueued,
      simulationJobId,
      ...(aiSimulation.acceptedCandidateCount !== undefined
        ? { acceptedCandidateCount: aiSimulation.acceptedCandidateCount }
        : {}),
    },
    ...(() => {
      const notes = parseNotes(hint.notes);
      return notes ? { notes } : {};
    })(),
  };

  return { payload, simulationJobId };
}

export function storeFinalMatchConsumptionHintForJob(
  simulationJobId: string,
  payload: StoredFinalMatchConsumptionHintV0,
): void {
  const key = buildFinalMatchConsumptionHintStorageKey(simulationJobId);
  if (!key) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Read storage for URL `aiSimJobId`; validate contract + job id match; return null on any failure.
 */
export function readValidatedFinalMatchConsumptionHint(
  aiSimJobId: string,
): StoredFinalMatchConsumptionHintV0 | null {
  const urlId = String(aiSimJobId).trim();
  if (!urlId) return null;
  const key = buildFinalMatchConsumptionHintStorageKey(urlId);
  if (!key) return null;
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(key);
  } catch {
    return null;
  }
  if (raw == null || raw === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.orchestrationSchemaVersion !== ORCHESTRATION_MVP_SCHEMA_V0) return null;
  if (parsed.source !== "orchestrator_a2") return null;
  const ai = parseAiSimulation(parsed.aiSimulation);
  if (!ai?.simulationJobId || ai.simulationJobId.trim() !== urlId) return null;
  const prescreen = parsePrescreen(parsed.prescreen);
  if (!prescreen) return null;
  if (typeof parsed.poolId !== "string" || !parsed.poolId.trim()) return null;
  if (typeof parsed.runMode !== "string") return null;
  if (typeof parsed.ready !== "boolean") return null;

  const out: StoredFinalMatchConsumptionHintV0 = {
    orchestrationSchemaVersion: ORCHESTRATION_MVP_SCHEMA_V0,
    source: "orchestrator_a2",
    poolId: parsed.poolId.trim(),
    runMode: parsed.runMode,
    ready: parsed.ready,
    prescreen,
    aiSimulation: {
      enqueued: ai.enqueued,
      simulationJobId: ai.simulationJobId.trim(),
      ...(ai.acceptedCandidateCount !== undefined ? { acceptedCandidateCount: ai.acceptedCandidateCount } : {}),
    },
    ...(() => {
      const notes = parseNotes(parsed.notes);
      return notes ? { notes } : {};
    })(),
  };
  return out;
}
