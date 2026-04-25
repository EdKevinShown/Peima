import { BadRequestException } from "@nestjs/common";
import { SIMULATION_V1_MAX_CANDIDATES_PER_JOB } from "./ai-simulation-v1.constants";
import type { SimulationHintSnapshotEntry } from "./ai-simulation-v1.types";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * Parse and filter hint snapshot → ordered candidate ids (Top-8).
 * §2.1–2.2 implementation notes.
 */
export function resolveSimulationQueueFromHintSnapshot(snapshot: unknown): {
  entries: SimulationHintSnapshotEntry[];
  simulationQueueActual: string[];
} {
  if (!Array.isArray(snapshot)) {
    throw new BadRequestException("hintSnapshot must be a JSON array");
  }

  const parsed: SimulationHintSnapshotEntry[] = [];
  for (const raw of snapshot) {
    if (!isRecord(raw)) continue;
    const rankHint = Number(raw.rankHint);
    const candidateUserId = typeof raw.candidateUserId === "string" ? raw.candidateUserId.trim() : "";
    const bucket = raw.bucket;
    const prescreenScore = Number(raw.prescreenScore);
    if (!candidateUserId || !Number.isFinite(rankHint) || !Number.isFinite(prescreenScore)) {
      continue;
    }
    if (bucket !== "promote" && bucket !== "neutral" && bucket !== "demote") {
      continue;
    }
    if (bucket === "demote") {
      continue;
    }
    parsed.push({
      rankHint,
      candidateUserId,
      bucket: bucket as "promote" | "neutral",
      prescreenScore,
    });
  }

  parsed.sort((a, b) => a.rankHint - b.rankHint);

  const top = parsed.slice(0, SIMULATION_V1_MAX_CANDIDATES_PER_JOB);
  const simulationQueueActual = top.map((e) => e.candidateUserId);

  return { entries: top, simulationQueueActual };
}
