import type {
  InteractionSimulationLiteAxesDto,
  InteractionSimulationLiteOverallDto,
} from "./interaction-simulation-lite.types";

function isBand3(x: unknown): x is "high" | "medium" | "low" {
  return x === "high" || x === "medium" || x === "low";
}

function isRiskBand(x: unknown): x is "low" | "medium" | "high" {
  return x === "low" || x === "medium" || x === "high";
}

function isConfidence(x: unknown): x is "high" | "medium" | "low" {
  return x === "high" || x === "medium" || x === "low";
}

function isVerdict(x: unknown): x is "worth_exploring" | "cautious" | "pause" {
  return x === "worth_exploring" || x === "cautious" || x === "pause";
}

function readAxis3(raw: unknown): {
  band: "high" | "medium" | "low";
  oneLiner: string;
  confidence: "high" | "medium" | "low";
} | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!isBand3(o.band)) return null;
  if (typeof o.oneLiner !== "string" || !o.oneLiner.trim()) return null;
  if (!isConfidence(o.confidence)) return null;
  return {
    band: o.band,
    oneLiner: o.oneLiner.trim().slice(0, 200),
    confidence: o.confidence,
  };
}

function readAxisRisk(raw: unknown): {
  band: "low" | "medium" | "high";
  oneLiner: string;
  confidence: "high" | "medium" | "low";
} | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!isRiskBand(o.band)) return null;
  if (typeof o.oneLiner !== "string" || !o.oneLiner.trim()) return null;
  if (!isConfidence(o.confidence)) return null;
  return {
    band: o.band,
    oneLiner: o.oneLiner.trim().slice(0, 200),
    confidence: o.confidence,
  };
}

function readOverall(raw: unknown): InteractionSimulationLiteOverallDto | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!isVerdict(o.verdict)) return null;
  if (typeof o.summary !== "string" || !o.summary.trim()) return null;
  if (!isConfidence(o.confidence)) return null;
  return {
    verdict: o.verdict,
    summary: o.summary.trim().slice(0, 1200),
    confidence: o.confidence,
  };
}

export function parseInteractionSimulationLiteModelJson(
  rawContent: string,
): {
  axes: InteractionSimulationLiteAxesDto;
  overall: InteractionSimulationLiteOverallDto;
} | null {
  let root: unknown;
  try {
    root = JSON.parse(rawContent) as unknown;
  } catch {
    return null;
  }
  if (root == null || typeof root !== "object" || Array.isArray(root)) {
    return null;
  }
  const r = root as Record<string, unknown>;
  const axesRaw = r.axes;
  if (axesRaw == null || typeof axesRaw !== "object" || Array.isArray(axesRaw)) {
    return null;
  }
  const ax = axesRaw as Record<string, unknown>;
  const pickupEase = readAxis3(ax.pickupEase);
  const coldFieldRisk = readAxisRisk(ax.coldFieldRisk);
  const misunderstandingRisk = readAxisRisk(ax.misunderstandingRisk);
  const continuationSignal = readAxis3(ax.continuationSignal);
  const overall = readOverall(r.overall);
  if (
    !pickupEase ||
    !coldFieldRisk ||
    !misunderstandingRisk ||
    !continuationSignal ||
    !overall
  ) {
    return null;
  }
  return {
    axes: {
      pickupEase,
      coldFieldRisk,
      misunderstandingRisk,
      continuationSignal,
    },
    overall,
  };
}
