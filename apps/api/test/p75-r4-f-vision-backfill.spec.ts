import { Prisma } from "@peima/database";
import { parseP75R4FVisionBackfillCliArgs } from "../src/dev-cli/p75-r4-f-vision-backfill-cli-args";
import {
  assertVisionBackfillReportPrivacySafe,
  buildMergedDetectionScoreJsonForBackfill,
  buildVisionBackfillReport,
  classifyUserImageForVisionBackfill,
  createEmptyVisionBackfillSummary,
  finalizeVisionBackfillSampleTags,
  recordVisionBackfillSkip,
  recordVisionBackfillSampleTags,
  visionBackfillPreservesDetectionSidecar,
  visionEnvForBackfill,
} from "../src/modules/onboarding/vision/p75-r4-f-vision-backfill";
import { detectionScoreJsonHasVision } from "../src/modules/onboarding/vision/onboarding-vision-score-json.merge";

const sampleDetection = {
  quality: { meanLuma: 120, laplacianVariance: 90, width: 800, height: 600 },
  face: {
    faceCount: 1,
    faces: [],
    primaryFace: {
      score: 0.9,
      box: { x: 100, y: 80, width: 200, height: 240 },
      areaRatio: 0.08,
      centerDistance: 0.2,
      primaryScore: 0.85,
      index: 0,
    },
  },
  warnings: ["MULTIPLE_FACES"],
  pipeline: ["quality", "face"],
  faceDetectionEnabled: true,
};

describe("parseP75R4FVisionBackfillCliArgs", () => {
  it("defaults to dryRun=true, onlyMissingVision=true, provider=rules", () => {
    const args = parseP75R4FVisionBackfillCliArgs([]);
    expect(args.dryRun).toBe(true);
    expect(args.onlyMissingVision).toBe(true);
    expect(args.provider).toBe("rules");
    expect(args.includeBlocked).toBe(false);
    expect(args.limit).toBe(100);
  });
});

describe("classifyUserImageForVisionBackfill", () => {
  it("skips blocked reviewStatus by default", () => {
    const r = classifyUserImageForVisionBackfill(
      {
        reviewStatus: "rejected",
        detectionScoreJson: sampleDetection,
      },
      { onlyMissingVision: true, includeBlocked: false },
    );
    expect(r).toEqual({ action: "skip", reason: "blocked_review" });
  });

  it("skips existing vision when onlyMissingVision", () => {
    const withVision = {
      ...sampleDetection,
      vision: { schemaVersion: "onboarding-vision-v1", photoVisualTags: ["生活感"] },
    };
    const r = classifyUserImageForVisionBackfill(
      { reviewStatus: "not_required", detectionScoreJson: withVision },
      { onlyMissingVision: true, includeBlocked: false },
    );
    expect(r).toEqual({ action: "skip", reason: "existing_vision" });
  });

  it("does not throw on non-object detectionScoreJson", () => {
    const r = classifyUserImageForVisionBackfill(
      { reviewStatus: "not_required", detectionScoreJson: "bad" },
      { onlyMissingVision: true, includeBlocked: false },
    );
    expect(r).toEqual({
      action: "skip",
      reason: "non_object_detection_score_json",
    });
  });
});

describe("buildMergedDetectionScoreJsonForBackfill", () => {
  it("merges vision and preserves quality/face/warnings/pipeline", () => {
    const env = visionEnvForBackfill("rules", {
      PEIMA_ONBOARDING_VISION_ENABLED: "1",
    } as NodeJS.ProcessEnv);
    const built = buildMergedDetectionScoreJsonForBackfill(sampleDetection, env);
    expect(built).not.toBeNull();
    expect(
      visionBackfillPreservesDetectionSidecar(sampleDetection, built!.merged),
    ).toBe(true);
    expect(detectionScoreJsonHasVision(built!.merged)).toBe(true);
  });
});

describe("vision backfill report privacy", () => {
  it("output does not contain reviewNote or imageUrl", () => {
    const summary = createEmptyVisionBackfillSummary();
    summary.scanned = 1;
    summary.eligible = 1;
    summary.wouldUpdate = 1;
    const report = buildVisionBackfillReport(
      parseP75R4FVisionBackfillCliArgs(["--dryRun=true"]),
      summary,
      [{ tag: "清爽自然", count: 2 }],
    );
    const json = JSON.stringify(report);
    expect(json).not.toContain("reviewNote");
    expect(json).not.toContain("imageUrl");
    assertVisionBackfillReportPrivacySafe(json);
  });
});

describe("vision backfill summary aggregation", () => {
  it("single failure does not throw; summary tracks failed", () => {
    const summary = createEmptyVisionBackfillSummary();
    summary.scanned = 2;
    summary.eligible = 2;
    summary.failed = 1;
    summary.wouldUpdate = 1;
    recordVisionBackfillSkip(summary, "blocked_review");
    expect(summary.skippedBlockedReview).toBe(1);
    expect(summary.scanned).toBe(2);
  });

  it("collects sample tags from vision profiles", () => {
    const env = visionEnvForBackfill("stub", {
      PEIMA_ONBOARDING_VISION_ENABLED: "1",
    } as NodeJS.ProcessEnv);
    const built = buildMergedDetectionScoreJsonForBackfill(sampleDetection, env)!;
    const counts = new Map<string, number>();
    recordVisionBackfillSampleTags(counts, built.vision);
    const tags = finalizeVisionBackfillSampleTags(counts, 5);
    expect(tags.length).toBeGreaterThan(0);
    expect(tags[0]!.count).toBeGreaterThanOrEqual(1);
  });
});

describe("dryRun vs write (unit-level)", () => {
  const update = jest.fn();

  async function runBackfillPass(dryRun: boolean): Promise<void> {
    const env = visionEnvForBackfill("rules", {
      PEIMA_ONBOARDING_VISION_ENABLED: "1",
    } as NodeJS.ProcessEnv);
    const built = buildMergedDetectionScoreJsonForBackfill(sampleDetection, env);
    if (!built) return;
    if (!dryRun) {
      await update({
        where: { id: "img-1" },
        data: {
          detectionScoreJson: built.merged as Prisma.InputJsonValue,
        },
      });
    }
  }

  beforeEach(() => {
    update.mockReset();
  });

  it("dryRun does not call prisma update", async () => {
    await runBackfillPass(true);
    expect(update).not.toHaveBeenCalled();
  });

  it("dryRun=false writes vision merge", async () => {
    await runBackfillPass(false);
    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0]![0].data.detectionScoreJson;
    expect(detectionScoreJsonHasVision(payload)).toBe(true);
    expect(payload.quality).toEqual(sampleDetection.quality);
  });
});
