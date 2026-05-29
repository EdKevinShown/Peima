/**
 * P7.10-r6f1 — map shadow payload → rehearsal sidecar create input (no DB I/O).
 */

import type { Prisma } from "@peima/database";
import type {
  P76CanonicalWriterRehearsalMetaCreateInput,
  P76CanonicalWriterRehearsalWriterRowInput,
} from "./p76-canonical-writer-rehearsal-writer.types";
import { P76_REHEARSAL_WRITER_REHEARSAL_MODE } from "./p76-canonical-writer-rehearsal-writer.types";

export type MapP76CanonicalWriterRehearsalRowContext = {
  auditRunId: string;
  environment: "dev" | "staging";
  readPathSourceVersion: string;
};

export function mapP76CanonicalWriterRehearsalRowToCreateInput(
  row: P76CanonicalWriterRehearsalWriterRowInput,
  ctx: MapP76CanonicalWriterRehearsalRowContext,
): P76CanonicalWriterRehearsalMetaCreateInput {
  const { shadow } = row;
  return {
    viewerUserId: row.viewerUserId.trim(),
    matchResultId: row.matchResultId.trim(),
    baselineCandidateUserId: shadow.baseline.candidateUserId,
    proposedCandidateUserId: shadow.proposal.selectedCandidateUserId,
    baselineFinalScore: shadow.baseline.finalScore,
    proposedScore: shadow.proposal.score,
    scoreVersion: shadow.proposal.scoreVersion,
    wouldChangeCandidate: shadow.comparison.wouldChangeCandidate,
    eligible: shadow.guardrails.eligible,
    guardrailReason: shadow.guardrails.reason,
    scoreDeltaBand: shadow.comparison.scoreDeltaBand,
    sourceType: shadow.sourceType,
    sourceVersion: shadow.sourceVersion,
    pipelineVersion: shadow.pipelineVersion,
    readPathSourceVersion: ctx.readPathSourceVersion.trim(),
    allowlistApplyMetaId: row.allowlistApplyMetaId?.trim() || null,
    auditRunId: ctx.auditRunId.trim(),
    rehearsalMode: P76_REHEARSAL_WRITER_REHEARSAL_MODE,
    environment: ctx.environment,
    appliedToMatchResult: false,
    shadowPayload: shadow as Prisma.InputJsonValue,
    summary: (row.summary ?? undefined) as Prisma.InputJsonValue | undefined,
    generatedAt: new Date(shadow.generatedAt),
  };
}
