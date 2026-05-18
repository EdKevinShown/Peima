/**
 * P7.6-r6b: orchestrate end-to-end funnel shadow audit (read-only).
 */

import * as fs from "fs";
import type { PrismaClient } from "@peima/database";
import {
  P76R6bCliArgsError,
  finalizeP76R6EndToEndFunnelShadowAuditCliArgs,
  type P76R6EndToEndFunnelShadowAuditCliArgs,
  type P76R6EndToEndFunnelShadowAuditCliArgsRaw,
} from "../../dev-cli/p76-r6-end-to-end-funnel-shadow-audit-cli-args";
import { buildP76EndToEndFunnelShadowAuditV1 } from "./p76-end-to-end-funnel-shadow-aggregator";
import type {
  P76EndToEndFunnelInputV1,
  P76EndToEndFunnelShadowAuditV1,
  P76Stage1PhotoVisualSummaryV1,
  P76Stage2TwentyDSummaryV1,
  P76Stage3RrmSummaryV1,
} from "./p76-end-to-end-funnel-shadow.types";
import { loadP76LegacyComparisonContext } from "./p76-end-to-end-funnel-legacy-adapter";
import {
  buildMinimalStage1Summary,
  buildMinimalStage2Summary,
  buildMinimalStage3Summary,
  parseP76StageAuditJsonDocument,
  type P76StageAuditJsonExtractV1,
} from "./p76-end-to-end-funnel-stage-audit-json";

function readAuditJsonFile(path: string): unknown {
  const text = fs.readFileSync(path, "utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new P76R6bCliArgsError(`invalid JSON at ${path}`);
  }
}

export function loadP76StageAuditJsonExtracts(
  raw: P76R6EndToEndFunnelShadowAuditCliArgsRaw,
): P76StageAuditJsonExtractV1 {
  const merged: P76StageAuditJsonExtractV1 = {};

  if (raw.stage1AuditJsonPath) {
    const doc = readAuditJsonFile(raw.stage1AuditJsonPath);
    const part = parseP76StageAuditJsonDocument(doc);
    merged.stage1 = { ...merged.stage1, ...part.stage1 };
  }

  if (raw.stage2AuditJsonPath) {
    const doc = readAuditJsonFile(raw.stage2AuditJsonPath);
    const part = parseP76StageAuditJsonDocument(doc);
    merged.stage2 = { ...merged.stage2, ...part.stage2 };
  }

  if (raw.stage3AuditJsonPath) {
    const doc = readAuditJsonFile(raw.stage3AuditJsonPath);
    const part = parseP76StageAuditJsonDocument(doc);
    merged.stage3 = { ...merged.stage3, ...part.stage3 };
  }

  return merged;
}

export function buildP76StageSummariesFromCli(
  cli: P76R6EndToEndFunnelShadowAuditCliArgs,
  extract: P76StageAuditJsonExtractV1,
): {
  stage1PhotoVisual: P76Stage1PhotoVisualSummaryV1;
  stage2TwentyD: P76Stage2TwentyDSummaryV1;
  stage3Rrm: P76Stage3RrmSummaryV1;
} {
  const stage1Ids =
    cli.stage1SelectedCandidateIds.length > 0
      ? cli.stage1SelectedCandidateIds
      : (extract.stage1?.selectedCandidateIds ?? []);

  const stage1PhotoVisual: P76Stage1PhotoVisualSummaryV1 =
    extract.stage1?.topCandidatesSummary &&
    extract.stage1.topCandidatesSummary.length > 0
      ? {
          sourceVersion:
            extract.stage1.sourceVersion ??
            buildMinimalStage1Summary(stage1Ids).sourceVersion,
          selectedCandidateIds: stage1Ids,
          topCandidatesSummary: extract.stage1.topCandidatesSummary,
        }
      : buildMinimalStage1Summary(
          stage1Ids,
          extract.stage1?.sourceVersion,
        );

  const stage2TwentyD: P76Stage2TwentyDSummaryV1 =
    extract.stage2?.rankedCandidatesSummary &&
    extract.stage2.rankedCandidatesSummary.length > 0
      ? {
          sourceVersion:
            extract.stage2.sourceVersion ??
            buildMinimalStage2Summary({
              top2CandidateIds: cli.stage2Top2CandidateIds,
              selectedBy20DOnlyCandidateId: cli.selectedBy20DOnlyCandidateId,
            }).sourceVersion,
          top2CandidateIds: cli.stage2Top2CandidateIds,
          selectedBy20DOnlyCandidateId: cli.selectedBy20DOnlyCandidateId,
          rankedCandidatesSummary: extract.stage2.rankedCandidatesSummary,
        }
      : buildMinimalStage2Summary({
          top2CandidateIds: cli.stage2Top2CandidateIds,
          selectedBy20DOnlyCandidateId: cli.selectedBy20DOnlyCandidateId,
          sourceVersion: extract.stage2?.sourceVersion,
        });

  const stage3Rrm: P76Stage3RrmSummaryV1 =
    extract.stage3?.rankedCandidatesSummary &&
    extract.stage3.rankedCandidatesSummary.length > 0
      ? {
          sourceVersion:
            extract.stage3.sourceVersion ??
            buildMinimalStage3Summary({
              selectedByRrmCandidateId: cli.selectedByRrmCandidateId,
              top2CandidateIds: cli.stage2Top2CandidateIds,
            }).sourceVersion,
          selectedByRrmCandidateId: cli.selectedByRrmCandidateId,
          rankedCandidatesSummary: extract.stage3.rankedCandidatesSummary,
          reasonSummary:
            extract.stage3.reasonSummary ?? "stage3_rrm_from_audit_json",
        }
      : buildMinimalStage3Summary({
          selectedByRrmCandidateId: cli.selectedByRrmCandidateId,
          top2CandidateIds: cli.stage2Top2CandidateIds,
          reasonSummary: extract.stage3?.reasonSummary,
          sourceVersion: extract.stage3?.sourceVersion,
        });

  return { stage1PhotoVisual, stage2TwentyD, stage3Rrm };
}

export async function runP76R6EndToEndFunnelShadowAudit(
  prisma: PrismaClient,
  raw: P76R6EndToEndFunnelShadowAuditCliArgsRaw,
): Promise<P76EndToEndFunnelShadowAuditV1> {
  const extract = loadP76StageAuditJsonExtracts(raw);

  const cli = finalizeP76R6EndToEndFunnelShadowAuditCliArgs(raw, {
    stage2Top2CandidateIds: extract.stage2?.top2CandidateIds,
    selectedBy20DOnlyCandidateId: extract.stage2?.selectedBy20DOnlyCandidateId,
    selectedByRrmCandidateId: extract.stage3?.selectedByRrmCandidateId,
  });

  const { stage1PhotoVisual, stage2TwentyD, stage3Rrm } =
    buildP76StageSummariesFromCli(cli, extract);

  const generatedAt = new Date().toISOString();

  const { legacy } = await loadP76LegacyComparisonContext(prisma, cli);

  const input: P76EndToEndFunnelInputV1 = {
    viewerUserId: cli.viewerUserId,
    sourcePoolType: cli.sourcePoolType,
    generatedAt,
    stage1PhotoVisual,
    stage2TwentyD,
    stage3Rrm,
    legacy,
  };

  return buildP76EndToEndFunnelShadowAuditV1(input);
}
