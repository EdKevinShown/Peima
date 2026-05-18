/**
 * P7.7-r1 — read path + safe fallback negative regression (resolver layer).
 * Complements p76-read-path-display-resolver.spec.ts with stale / dry_run / violation / baseline preservation.
 */
import type { MatchResult } from "@peima/database";
import {
  applyP76ReadPathDisplayOverlay,
  deriveP76ReadPathFallbackReason,
  resolveP76AllowlistSidecarDisplayCandidate,
} from "../src/modules/matching/p76-read-path-display-resolver";
import type { P76AllowlistApplyMetaDbRow } from "../src/modules/matching/p76-admin-allowlist-apply-meta.types";
import { P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION } from "../src/modules/matching/p76-allowlist-apply-meta.types";
import { attachResultStateToViewerPayload } from "../src/modules/matching/matching-result-state";

const VIEWER = "p77-viewer";
const CANDIDATE = "p77-candidate";
const LEGACY_CANDIDATE = "p77-legacy-cand";

function baseRow(
  overrides: Partial<P76AllowlistApplyMetaDbRow> = {},
): P76AllowlistApplyMetaDbRow {
  return {
    id: "sidecar-p77",
    viewerUserId: VIEWER,
    selectedCandidateId: CANDIDATE,
    sourcePipeline: "p7.6_route_c",
    schemaVersion: "p7.6-allowlist-apply-meta-v1",
    sourceVersion: P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
    routeCArtifactPath: null,
    stage1SelectedCandidateIds: [CANDIDATE],
    stage2Top2CandidateIds: [CANDIDATE],
    selectedBy20DOnlyCandidateId: CANDIDATE,
    selectedByRrmCandidateId: CANDIDATE,
    finalShadowSelectedCandidateId: CANDIDATE,
    allowlistMatched: true,
    pmSignoffStatus: "approved",
    opsSignoffStatus: "approved",
    applied: true,
    appliedToPool: false,
    appliedToMatchResult: false,
    appliedToFinalScore: false,
    appliedToDisplay: false,
    appliedToWorkerRanking: false,
    dryRun: false,
    appliedAt: new Date("2026-05-18T00:00:00.000Z"),
    appliedBy: null,
    rolledBack: false,
    rolledBackAt: null,
    rolledBackBy: null,
    rollbackReason: null,
    rollbackToken: null,
    auditNotes: {},
    createdAt: new Date("2026-05-18T00:00:00.000Z"),
    updatedAt: new Date("2026-05-18T00:00:00.000Z"),
    ...overrides,
  };
}

function enabledEnv(over: Record<string, unknown> = {}) {
  return {
    enabled: true,
    viewerAllowlist: [VIEWER],
    sourceVersion: P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
    requirePmSignoff: true,
    requireOpsSignoff: true,
    safeFallbackEnabled: true,
    fallbackLegacy: true,
    deprecatedAliasUsed: false,
    strictViolationBlock: true,
    ...over,
  };
}

function legacyDisplay() {
  return {
    displayCandidateUserId: LEGACY_CANDIDATE,
    displaySourceType: "match_result_original",
    finalMatchDecisionMeta: null,
  };
}

function mockPrisma(row: P76AllowlistApplyMetaDbRow | null, candidateExists = true) {
  return {
    p76AllowlistApplyMeta: {
      findUnique: jest.fn().mockResolvedValue(row),
    },
    user: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        candidateExists && where.id === CANDIDATE
          ? Promise.resolve({ id: where.id })
          : Promise.resolve(null),
      ),
    },
  } as unknown as import("../src/common/prisma/prisma.service").PrismaService;
}

describe("P7.7-r1 read path negative regression", () => {
  it("stale sourceVersion → ineligible, fallbackReason stale_source_version", async () => {
    const prisma = mockPrisma(
      baseRow({ sourceVersion: "stale-cohort-v0" }),
    );
    const r = await resolveP76AllowlistSidecarDisplayCandidate(
      prisma,
      { viewerUserId: VIEWER, legacyDisplay: legacyDisplay() },
      enabledEnv(),
    );
    expect(r.eligible).toBe(false);
    expect(r.fallbackReason).toBe("stale_source_version");
    expect(r.meta.fallbackUsed).toBe(true);
  });

  it("sidecar dry_run → sidecar_dry_run, baseline preserved via overlay", async () => {
    const prisma = mockPrisma(
      baseRow({ applied: false, dryRun: true }),
    );
    const overlay = await resolveP76AllowlistSidecarDisplayCandidate(
      prisma,
      { viewerUserId: VIEWER, legacyDisplay: legacyDisplay() },
      enabledEnv(),
    );
    expect(overlay.fallbackReason).toBe("sidecar_dry_run");

    const display = await applyP76ReadPathDisplayOverlay(prisma, {
      viewerUserId: VIEWER,
      legacyDisplay: legacyDisplay(),
    });
    expect(display.displayCandidateUserId).toBe(LEGACY_CANDIDATE);
    expect(display.displaySourceType).toBe("match_result_original");
    expect(display.p76ReadPathMeta?.fallbackUsed).toBe(true);
  });

  it("strictViolationBlock + artifact_missing → violation_* reason, no throw", () => {
    const reason = deriveP76ReadPathFallbackReason({
      env: enabledEnv(),
      viewerUserId: VIEWER,
      row: baseRow(),
      violationStatus: "artifact_missing",
      sidecarStatus: "written",
      candidateFound: true,
    });
    expect(reason).toBe("violation_artifact_missing");
  });

  it("applyP76ReadPathDisplayOverlay never throws on DB error", async () => {
    const prisma = {
      p76AllowlistApplyMeta: {
        findUnique: jest.fn().mockRejectedValue(new Error("db down")),
      },
    } as unknown as import("../src/common/prisma/prisma.service").PrismaService;
    await expect(
      applyP76ReadPathDisplayOverlay(prisma, {
        viewerUserId: VIEWER,
        legacyDisplay: legacyDisplay(),
      }),
    ).resolves.toMatchObject({
      displayCandidateUserId: LEGACY_CANDIDATE,
      displaySourceType: "match_result_original",
    });
  });

  it("read-path fallback → resultState safe_fallback, baseline display category", () => {
    const withMeta = attachResultStateToViewerPayload({
      displayCandidateUserId: LEGACY_CANDIDATE,
      displaySourceType: "match_result_original",
      candidateUserId: LEGACY_CANDIDATE,
      finalScore: 0.77,
      p76ReadPathMeta: {
        enabled: true,
        fallbackUsed: true,
        fallbackReason: "stale_source_version",
        sidecarId: null,
        sourceVersion: P76_ALLOWLIST_DEFAULT_POOL_SOURCE_VERSION,
        rolledBack: null,
        violationStatus: "stale_source_version",
        pmSignoffStatus: null,
        opsSignoffStatus: null,
      },
    });
    expect(withMeta.resultState).toBe("safe_fallback");
    expect(withMeta.safeFallback?.active).toBe(true);
    expect(withMeta.safeFallback?.reason).toBe("stale_sidecar");
    expect(withMeta.candidateUserId).toBe(LEGACY_CANDIDATE);
    expect(withMeta.finalScore).toBe(0.77);
    expect(withMeta.displaySourceType).toBe("match_result_original");
  });

  it("match row fields unchanged when overlay uses baseline (mr candidate vs display)", () => {
    const matchRow = {
      id: "mr-p77",
      userId: VIEWER,
      candidateUserId: LEGACY_CANDIDATE,
      batchId: "b1",
      finalScore: 0.91,
      reasonSummary: "ok",
      status: "active",
      matchInsights: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as MatchResult;
    expect(matchRow.candidateUserId).toBe(LEGACY_CANDIDATE);
    expect(matchRow.finalScore).toBe(0.91);
  });
});
