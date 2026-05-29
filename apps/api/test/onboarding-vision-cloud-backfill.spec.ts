import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Prisma } from "@peima/database";
import {
  isCloudVisionBackfillProvider,
  parseP75R4FVisionBackfillCliArgs,
} from "../src/dev-cli/p75-r4-f-vision-backfill-cli-args";
import { ONBOARDING_VISION_SOURCE_CLOUD_ZHIPU } from "../src/modules/onboarding/vision/cloud-vision.facade";
import { readOnboardingVisionEnv } from "../src/modules/onboarding/vision/onboarding-vision-env";
import {
  buildMergedDetectionScoreJsonForBackfill,
  visionBackfillPreservesDetectionSidecar,
  visionEnvForBackfill,
} from "../src/modules/onboarding/vision/p75-r4-f-vision-backfill";
import {
  buildMergedDetectionScoreJsonForCloudBackfill,
  readCloudVisionImageRefFromUploadDir,
  storedFilenameFromUserImageUrl,
  visionEnvForCloudBackfill,
} from "../src/modules/onboarding/vision/p75-r7-c3-cloud-vision-backfill";
import type { OnboardingVisionProfileV1 } from "../src/modules/onboarding/vision/onboarding-vision.types";
import { detectionScoreJsonHasVision } from "../src/modules/onboarding/vision/onboarding-vision-score-json.merge";

const sampleDetection = {
  quality: { meanLuma: 120, laplacianVariance: 90, width: 800, height: 600 },
  face: { faceCount: 1, faces: [] },
  warnings: [],
  pipeline: ["quality", "face"],
};

function liveZhipuEnv() {
  return {
    ...readOnboardingVisionEnv({} as NodeJS.ProcessEnv),
    enabled: true,
    provider: "cloud" as const,
    baseUrl: "https://vision.example.test/v1/chat/completions",
    apiKey: "test-api-key",
    cloudDryRun: false,
    cloudHttpEnabled: true,
    cloudVendor: "zhipu" as const,
    cloudAllowlistImageIds: ["img-live"],
    cloudAllowlistUserIds: [],
  };
}

function mockFetchOk(): jest.Mock {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => "req-1" },
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              labels: {
                photoVisual: [{ tag: "清爽自然", score: 0.9 }],
                quality: [{ tag: "清晰", score: 0.8 }],
                scene: [{ tag: "室内日常", score: 0.7 }],
              },
            }),
          },
        },
      ],
    }),
  } as unknown as Response);
}

describe("parseP75R4FVisionBackfillCliArgs cloud", () => {
  it("defaults cloud provider limit to 50 and dryRun true", () => {
    const args = parseP75R4FVisionBackfillCliArgs(["--provider=cloud"]);
    expect(args.provider).toBe("cloud");
    expect(args.limit).toBe(50);
    expect(args.dryRun).toBe(true);
    expect(isCloudVisionBackfillProvider(args.provider)).toBe(true);
  });

  it("parses imageIds and userIds allowlists", () => {
    const args = parseP75R4FVisionBackfillCliArgs([
      "--provider=cloud",
      "--imageIds=img-a,img-b",
      "--userIds=u1,u2",
    ]);
    expect(args.imageIds).toEqual(["img-a", "img-b"]);
    expect(args.userIds).toEqual(["u1", "u2"]);
  });
});

describe("rules/stub backfill unchanged", () => {
  it("rules merge preserves detection sidecar", () => {
    const env = visionEnvForBackfill("rules", {
      PEIMA_ONBOARDING_VISION_ENABLED: "1",
    } as NodeJS.ProcessEnv);
    const built = buildMergedDetectionScoreJsonForBackfill(sampleDetection, env);
    expect(built).not.toBeNull();
    expect(
      visionBackfillPreservesDetectionSidecar(sampleDetection, built!.merged),
    ).toBe(true);
    expect(built!.vision.provider).toBe("rules");
  });

  it("stub merge works", () => {
    const env = visionEnvForBackfill("stub", {
      PEIMA_ONBOARDING_VISION_ENABLED: "1",
    } as NodeJS.ProcessEnv);
    const built = buildMergedDetectionScoreJsonForBackfill(sampleDetection, env)!;
    expect(built.vision.provider).toBe("stub");
  });
});

describe("buildMergedDetectionScoreJsonForCloudBackfill", () => {
  let uploadDir: string;
  const stored = "u1-test.jpg";

  beforeEach(() => {
    uploadDir = join(tmpdir(), `peima-c3-${Date.now()}-${Math.random()}`);
    mkdirSync(uploadDir, { recursive: true });
    writeFileSync(join(uploadDir, stored), Buffer.from("fake-jpeg"));
  });

  it("storedFilenameFromUserImageUrl parses local path", () => {
    expect(
      storedFilenameFromUserImageUrl(
        `http://localhost:3000/uploads/user-images/${stored}`,
      ),
    ).toBe(stored);
  });

  it("missing file skips without throw", async () => {
    const env = visionEnvForCloudBackfill("cloud", {
      PEIMA_ONBOARDING_VISION_ENABLED: "1",
    } as NodeJS.ProcessEnv);
    const result = await buildMergedDetectionScoreJsonForCloudBackfill(
      {
        id: "img-1",
        userId: "u1",
        imageUrl: `http://x/uploads/user-images/missing.jpg`,
        detectionStatus: "passed",
        reviewStatus: "not_required",
        detectionScoreJson: sampleDetection,
      },
      env,
      uploadDir,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("image_file_missing");
    }
  });

  it("gate not met skips HTTP (mock path)", async () => {
    const env = visionEnvForCloudBackfill("cloud", {
      PEIMA_ONBOARDING_VISION_ENABLED: "1",
    } as NodeJS.ProcessEnv);
    const fetchMock = mockFetchOk();
    const result = await buildMergedDetectionScoreJsonForCloudBackfill(
      {
        id: "img-1",
        userId: "u1",
        imageUrl: `http://x/uploads/user-images/${stored}`,
        detectionStatus: "passed",
        reviewStatus: "not_required",
        detectionScoreJson: sampleDetection,
      },
      env,
      uploadDir,
      { httpFetch: fetchMock },
    );
    expect(result.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    if (result.ok) {
      expect(result.httpOutcome).toBe("skipped");
    }
  });

  it("allowlist + mocked HTTP produces cloud vision", async () => {
    const env = liveZhipuEnv();
    const fetchMock = mockFetchOk();
    const result = await buildMergedDetectionScoreJsonForCloudBackfill(
      {
        id: "img-live",
        userId: "u1",
        imageUrl: `http://x/uploads/user-images/${stored}`,
        detectionStatus: "passed",
        reviewStatus: "not_required",
        detectionScoreJson: sampleDetection,
      },
      env,
      uploadDir,
      { httpFetch: fetchMock },
    );
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (result.ok) {
      expect(result.httpOutcome).toBe("success");
      expect(result.vision.sourceVersion).toBe(ONBOARDING_VISION_SOURCE_CLOUD_ZHIPU);
      expect(result.vision.provider).toBe("cloud");
      expect(
        visionBackfillPreservesDetectionSidecar(sampleDetection, result.merged),
      ).toBe(true);
      const json = JSON.stringify(result.merged);
      expect(json).not.toContain("test-api-key");
      expect(json).not.toContain("base64");
    }
  });

  it("readCloudVisionImageRefFromUploadDir returns bytes", async () => {
    const ref = await readCloudVisionImageRefFromUploadDir(
      `http://x/uploads/user-images/${stored}`,
      uploadDir,
    );
    expect(ref?.kind).toBe("bytes");
    expect(ref && "buffer" in ref && ref.buffer.length).toBeGreaterThan(0);
  });
});

describe("dryRun vs write (cloud merge unit)", () => {
  const update = jest.fn();

  beforeEach(() => {
    update.mockReset();
  });

  it("dryRun does not call prisma update", async () => {
    const dryRun = true;
    const built = {
      merged: { ...sampleDetection, vision: { photoVisualTags: ["清爽自然"] } },
    };
    if (!dryRun) {
      await update({
        where: { id: "img-1" },
        data: { detectionScoreJson: built.merged as Prisma.InputJsonValue },
      });
    }
    expect(update).not.toHaveBeenCalled();
  });

  it("dryRun=false merges vision only", async () => {
    const env = visionEnvForBackfill("rules", {
      PEIMA_ONBOARDING_VISION_ENABLED: "1",
    } as NodeJS.ProcessEnv);
    const built = buildMergedDetectionScoreJsonForBackfill(sampleDetection, env)!;
    await update({
      where: { id: "img-1" },
      data: { detectionScoreJson: built.merged as Prisma.InputJsonValue },
    });
    const payload = update.mock.calls[0]![0].data.detectionScoreJson;
    expect(detectionScoreJsonHasVision(payload)).toBe(true);
    expect(payload.quality).toEqual(sampleDetection.quality);
    expect(payload.reviewStatus).toBeUndefined();
    expect(payload.detectionStatus).toBeUndefined();
  });
});
