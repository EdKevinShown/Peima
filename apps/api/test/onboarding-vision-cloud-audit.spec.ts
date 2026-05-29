import {
  assertCloudVisionBackfillReportPrivacySafe,
  buildCloudVisionBackfillAuditReport,
  createEmptyCloudVisionBackfillAudit,
  recordCloudVisionBackfillSkip,
  recordCloudVisionBackfillVisionAudit,
} from "../src/modules/onboarding/vision/p75-r7-c3-cloud-vision-backfill";
import { ONBOARDING_VISION_SOURCE_CLOUD_ZHIPU } from "../src/modules/onboarding/vision/cloud-vision.facade";
import type { OnboardingVisionProfileV1 } from "../src/modules/onboarding/vision/onboarding-vision.types";

function sampleVision(
  overrides: Partial<OnboardingVisionProfileV1> = {},
): OnboardingVisionProfileV1 {
  return {
    schemaVersion: "onboarding-vision-v1",
    sourceVersion: ONBOARDING_VISION_SOURCE_CLOUD_ZHIPU,
    photoVisualTaxonomyVersion: "p7.5-v1",
    provider: "cloud",
    generatedAt: new Date().toISOString(),
    visionStatus: "ok",
    fallbackUsed: false,
    photoVisualTags: ["清爽自然"],
    qualityTags: ["清晰"],
    sceneTags: ["室内日常"],
    confidence: 0.9,
    warnings: ["VISION_CLOUD_UNKNOWN_TAG"],
    ...overrides,
  };
}

describe("cloud vision backfill audit", () => {
  it("records fallbackReason and tag distributions", () => {
    const audit = createEmptyCloudVisionBackfillAudit({
      dryRun: true,
      provider: "cloud",
    });
    audit.scannedImages = 2;
    audit.eligibleImages = 1;
    recordCloudVisionBackfillSkip(audit, "image_file_missing");
    recordCloudVisionBackfillVisionAudit(
      audit,
      sampleVision({ fallbackReason: "cloud_zhipu_timeout" }),
      "failed",
    );

    const report = buildCloudVisionBackfillAuditReport(
      {
        limit: 50,
        dryRun: true,
        provider: "cloud",
        onlyMissingVision: true,
        includeBlocked: false,
        filters: { imageIds: [], userIds: [] },
      },
      audit,
    );

    expect(report.scannedImages).toBe(2);
    expect(report.skippedImages).toBe(1);
    expect(report.eligibleImages).toBe(1);
    expect(report.fallbackReasonDistribution.cloud_zhipu_timeout).toBe(1);
    expect(report.photoVisualTagDistribution["清爽自然"]).toBe(1);
    expect(report.qualityTagDistribution["清晰"]).toBe(1);
    expect(report.sceneTagDistribution["室内日常"]).toBe(1);
    expect(report.unknownTagDroppedCount).toBe(1);
    expect(report.cloudHttpAttemptedCount).toBe(1);
    expect(report.cloudHttpFailedCount).toBe(1);
    expect(report.skipReasonDistribution.image_file_missing).toBe(1);
  });

  it("tracks http skipped vs success", () => {
    const audit = createEmptyCloudVisionBackfillAudit({
      dryRun: false,
      provider: "cloud",
    });
    recordCloudVisionBackfillVisionAudit(
      audit,
      sampleVision({ fallbackUsed: false }),
      "success",
    );
    recordCloudVisionBackfillVisionAudit(
      audit,
      sampleVision({
        fallbackUsed: true,
        fallbackReason: "cloud_dry_run",
        sourceVersion: "p7.5-r7-cloud-dry-run-v1",
      }),
      "skipped",
    );

    expect(audit.cloudHttpSuccessCount).toBe(1);
    expect(audit.cloudHttpSkippedCount).toBe(1);
    expect(audit.cloudHttpAttemptedCount).toBe(1);
  });

  it("dryRun report shows updatedImages=0 until write", () => {
    const audit = createEmptyCloudVisionBackfillAudit({
      dryRun: true,
      provider: "cloud",
    });
    audit.eligibleImages = 3;
    const report = buildCloudVisionBackfillAuditReport(
      {
        limit: 50,
        dryRun: true,
        provider: "cloud",
        onlyMissingVision: true,
        includeBlocked: false,
        filters: { imageIds: ["img-1"], userIds: [] },
      },
      audit,
    );
    expect(report.dryRun).toBe(true);
    expect(report.updatedImages).toBe(0);
    expect(report.input.imageIdAllowlistCount).toBe(1);
  });

  it("report is privacy-safe", () => {
    const audit = createEmptyCloudVisionBackfillAudit({
      dryRun: true,
      provider: "cloud",
    });
    recordCloudVisionBackfillVisionAudit(
      audit,
      sampleVision(),
      "skipped",
    );
    const json = JSON.stringify(
      buildCloudVisionBackfillAuditReport(
        {
          limit: 50,
          dryRun: true,
          provider: "cloud",
          onlyMissingVision: true,
          includeBlocked: false,
          filters: { imageIds: [], userIds: [] },
        },
        audit,
      ),
    );
    expect(json).not.toContain("imageUrl");
    expect(json).not.toContain("reviewNote");
    assertCloudVisionBackfillReportPrivacySafe(json);
  });
});
