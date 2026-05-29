import {
  accumulateVisionCoverageFromPools,
  analyzeViewerVisionFlags,
  assertR4GVisionCoverageReportPrivacySafe,
  classifyCandidateVisionPrimaryGap,
  detectionScoreJsonHasVisionKey,
  detectionScoreJsonIsPersistableForAudit,
  incrementExclusiveCandidateBreakdown,
  suggestVisionCoverageNextAction,
} from "../src/modules/onboarding/vision/p75-r4-g-candidate-vision-coverage-audit";
import { parseR4GVisionCoverageCliArgs } from "../src/dev-cli/p75-r4-g-candidate-vision-coverage-cli-args";

const t0 = new Date("2020-01-01T00:00:00.000Z");

const okVision = {
  schemaVersion: "onboarding-vision-v1" as const,
  sourceVersion: "test",
  photoVisualTaxonomyVersion: "p7.5-v1" as const,
  provider: "rules" as const,
  generatedAt: "2020-01-01",
  visionStatus: "ok" as const,
  fallbackUsed: false,
  photoVisualTags: ["清爽自然"],
  confidence: 0.6,
};

function row(
  overrides: Partial<{
    createdAt: Date;
    detectionScoreJson: unknown;
    detectionStatus: string;
    reviewStatus: string;
  }>,
) {
  return {
    id: "img",
    userId: "u1",
    createdAt: overrides.createdAt ?? t0,
    detectionStatus: overrides.detectionStatus ?? "passed",
    reviewStatus: overrides.reviewStatus ?? "not_required",
    detectionScoreJson: overrides.detectionScoreJson ?? null,
  };
}

describe("classifyCandidateVisionPrimaryGap", () => {
  it("UserImage + vision ok + tags → usable_ok", () => {
    expect(
      classifyCandidateVisionPrimaryGap([
        row({
          detectionScoreJson: { quality: {}, vision: okVision },
        }),
      ]),
    ).toBe("usable_ok");
  });

  it("UserImage but no detectionScoreJson blob → missing_detection_score_json", () => {
    expect(
      classifyCandidateVisionPrimaryGap([
        row({
          detectionScoreJson: null,
          detectionStatus: "passed",
        }),
      ]),
    ).toBe("missing_detection_score_json");
  });

  it("detectionScoreJson object but no vision usable → missing_usable_vision", () => {
    expect(
      classifyCandidateVisionPrimaryGap([
        row({
          detectionScoreJson: {
            quality: { x: 1 },
            face: { y: 1 },
          },
        }),
      ]),
    ).toBe("missing_usable_vision");
  });

  it("visionStatus skipped → vision_skipped_present when not usable", () => {
    expect(
      classifyCandidateVisionPrimaryGap([
        row({
          detectionScoreJson: {
            quality: {},
            vision: { ...okVision, visionStatus: "skipped" },
          },
        }),
      ]),
    ).toBe("vision_skipped_present");
  });

  it("rejected review → blocked_review_present before missing_vision when no usable", () => {
    expect(
      classifyCandidateVisionPrimaryGap([
        row({
          reviewStatus: "rejected",
          detectionScoreJson: { quality: {} },
        }),
      ]),
    ).toBe("blocked_review_present");
  });

  it("multi images: chronological first usable wins", () => {
    expect(
      classifyCandidateVisionPrimaryGap([
        row({
          createdAt: new Date("2020-01-02T00:00:00.000Z"),
          detectionScoreJson: { vision: null },
          detectionStatus: "passed",
        }),
        row({
          createdAt: new Date("2020-01-03T00:00:00.000Z"),
          detectionScoreJson: { quality: {}, vision: okVision },
          detectionStatus: "passed",
        }),
      ]),
    ).toBe("usable_ok");
  });
});

describe("accumulateVisionCoverageFromPools + privacy", () => {
  const emptyBreakdown = {
    candidatesUsableVisionOk: 0,
    candidatesMissingUserImage: 0,
    candidatesMissingDetectionScoreJson: 0,
    candidatesMissingVision: 0,
    candidatesVisionSkipped: 0,
    candidatesBlockedReview: 0,
  };

  it("rollup matches unique candidates across pools", () => {
    const candA = okVision;

    const out = accumulateVisionCoverageFromPools({
      pools: [
        {
          userId: "v1",
          items: [
            { candidateUserId: "c1" },
            { candidateUserId: "c2" },
          ],
        },
        {
          userId: "v1",
          items: [{ candidateUserId: "c1" }],
        },
      ],
      viewerImagesByUserId: new Map([
        [
          "v1",
          [
            row({
              detectionScoreJson: { quality: {}, vision: candA },
            }),
          ],
        ],
      ]),
      candidateImagesByUserId: new Map([
        [
          "c1",
          [row({ detectionScoreJson: { quality: {}, vision: candA } })],
        ],
        ["c2", [row({ detectionScoreJson: {} })]],
      ]),
    });

    expect(out.uniqueCandidateUsers).toBe(2);
    expect(out.poolsScanned).toBe(2);
    expect(out.poolItemsScanned).toBe(3);
    expect(out.summary.candidateUsableVisionRate).toBe(0.5);
    expect(out.breakdown.candidatesUsableVisionOk).toBe(1);
    expect(out.breakdown.candidatesMissingVision).toBeGreaterThanOrEqual(0);
  });

  it("serialized audit-like report omits forbidden substrings", () => {
    const report = {
      schemaVersion: "p7.5-r4-g-candidate-vision-coverage-audit-v1",
      summary: {},
      recommendation: suggestVisionCoverageNextAction(
        emptyBreakdown,
        5,
      ),
    };
    const json = JSON.stringify(report);
    expect(json).not.toContain("reviewNote");
    expect(json).not.toContain("imageUrl");
    assertR4GVisionCoverageReportPrivacySafe(json);
  });
});

describe("parseR4GVisionCoverageCliArgs", () => {
  it("parses booleans", () => {
    const args = parseR4GVisionCoverageCliArgs([
      "--includeArchived=true",
      "--debugIds=false",
      "--limit=50",
    ]);
    expect(args.includeArchived).toBe(true);
    expect(args.debugIds).toBe(false);
    expect(args.limitPools).toBe(50);
  });
});

describe("analyzeViewerVisionFlags", () => {
  it("flags vision key presence", () => {
    const f = analyzeViewerVisionFlags([
      row({ detectionScoreJson: { vision: okVision } }),
    ]);
    expect(f.hasUserImage).toBe(true);
    expect(detectionScoreJsonHasVisionKey({ vision: okVision })).toBe(true);
    expect(f.hasVisionKeyAny).toBe(true);
    expect(detectionScoreJsonIsPersistableForAudit(undefined)).toBe(false);
  });
});

describe("exclusive breakdown increment", () => {
  it("counts single bucket increments", () => {
    const b = {
      candidatesUsableVisionOk: 0,
      candidatesMissingUserImage: 0,
      candidatesMissingDetectionScoreJson: 0,
      candidatesMissingVision: 0,
      candidatesVisionSkipped: 0,
      candidatesBlockedReview: 0,
    };
    incrementExclusiveCandidateBreakdown(b, classifyCandidateVisionPrimaryGap([]));
    expect(b.candidatesMissingUserImage).toBe(1);
  });
});
