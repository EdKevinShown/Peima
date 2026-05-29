import {
  evaluateExtremeQualityFromScores,
  EXTREME_MAX_LAPLACIAN_VARIANCE,
  EXTREME_MIN_MEAN_LUMA,
  laplacianVariance,
  mergeQualityAndFaceDetection,
  unreadableDetectionResult,
  USER_IMAGE_DETECTION_RULES_VERSION_R1A,
  USER_IMAGE_DETECTION_RULES_VERSION_R1C,
} from "../src/modules/images/user-image-quality-detection";
import { UserImageDetectionService } from "../src/modules/images/user-image-detection.service";
import type { UserImageFaceDetector } from "../src/modules/images/user-image-face-detection.adapter";
import sharp from "sharp";

async function sharpPatternJpegBuffer(): Promise<Buffer> {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
      <defs>
        <pattern id="p" width="16" height="16" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#c8b8a8"/>
          <rect x="8" y="8" width="8" height="8" fill="#c8b8a8"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#p)"/>
    </svg>`,
  );
  return sharp(svg).jpeg({ quality: 90 }).toBuffer();
}

describe("user-image-quality-detection (P7.4-r1a/r1b)", () => {
  const baseMetrics = {
    width: 800,
    height: 600,
    sampleWidth: 320,
    sampleHeight: 240,
    meanLuma: 120,
    laplacianVariance: 80,
  };

  describe("evaluateExtremeQualityFromScores", () => {
    it("passed for normal brightness and sharpness (face off path)", () => {
      const r = evaluateExtremeQualityFromScores(baseMetrics);
      expect(r.status).toBe("passed");
      expect(r.reasonCodes).toEqual([]);
      expect(r.rulesVersion).toBe(USER_IMAGE_DETECTION_RULES_VERSION_R1A);
    });

    it("failed with TOO_DARK when mean luma below threshold", () => {
      const r = evaluateExtremeQualityFromScores({
        ...baseMetrics,
        meanLuma: EXTREME_MIN_MEAN_LUMA - 1,
      });
      expect(r.status).toBe("failed");
      expect(r.reasonCodes).toContain("TOO_DARK");
    });

    it("failed with TOO_BLUR when laplacian variance below threshold", () => {
      const r = evaluateExtremeQualityFromScores({
        ...baseMetrics,
        laplacianVariance: EXTREME_MAX_LAPLACIAN_VARIANCE - 0.01,
      });
      expect(r.status).toBe("failed");
      expect(r.reasonCodes).toContain("TOO_BLUR");
    });

    it("unreadable helper returns UNREADABLE_IMAGE", () => {
      const r = unreadableDetectionResult();
      expect(r.status).toBe("failed");
      expect(r.reasonCodes).toEqual(["UNREADABLE_IMAGE"]);
    });
  });

  describe("mergeQualityAndFaceDetection", () => {
    it("failed with FACE_NOT_FOUND when faceCount is 0", () => {
      const r = mergeQualityAndFaceDetection({
        metrics: baseMetrics,
        faceCount: 0,
        faces: [],
        faceDetectionEnabled: true,
      });
      expect(r.status).toBe("failed");
      expect(r.reasonCodes).toEqual(["FACE_NOT_FOUND"]);
      expect(r.rulesVersion).toBe(USER_IMAGE_DETECTION_RULES_VERSION_R1C);
      expect(r.scoreJson?.face?.faceCount).toBe(0);
      expect(r.scoreJson?.face?.primaryFace).toBeUndefined();
    });

    it("passed with MULTIPLE_FACES warning when faceCount > 1", () => {
      const r = mergeQualityAndFaceDetection({
        metrics: baseMetrics,
        faceCount: 2,
        faces: [
          { score: 0.9, box: { x: 0, y: 0, width: 50, height: 50 } },
          { score: 0.8, box: { x: 60, y: 0, width: 50, height: 50 } },
        ],
        faceDetectionEnabled: true,
      });
      expect(r.status).toBe("passed");
      expect(r.reasonCodes).toEqual([]);
      expect(r.scoreJson?.warnings).toContain("MULTIPLE_FACES");
      expect(r.reasonCodes).not.toContain("MULTIPLE_FACES");
      expect(r.rulesVersion).toBe(USER_IMAGE_DETECTION_RULES_VERSION_R1C);
      expect(r.scoreJson?.face?.primaryFace).toBeDefined();
    });

    it("single face includes primaryFace at index 0", () => {
      const r = mergeQualityAndFaceDetection({
        metrics: baseMetrics,
        faceCount: 1,
        faces: [{ score: 0.88, box: { x: 300, y: 200, width: 160, height: 180 } }],
        faceDetectionEnabled: true,
      });
      expect(r.status).toBe("passed");
      expect(r.scoreJson?.face?.primaryFace?.index).toBe(0);
      expect(r.scoreJson?.face?.faces[0]?.areaRatio).toBeGreaterThan(0);
    });

    it("passed without face block when face detection disabled", () => {
      const r = mergeQualityAndFaceDetection({
        metrics: baseMetrics,
        faceCount: 0,
        faces: [],
        faceDetectionEnabled: false,
      });
      expect(r.status).toBe("passed");
      expect(r.scoreJson?.face).toBeUndefined();
      expect(r.scoreJson?.faceDetectionEnabled).toBe(false);
    });
  });

  describe("UserImageDetectionService.detectFromBuffer", () => {
    const mockDetector: UserImageFaceDetector = {
      detectFaces: async () => ({ faceCount: 1, faces: [{ score: 0.95, box: { x: 10, y: 10, width: 80, height: 80 } }] }),
    };

    let prevFaceEnv: string | undefined;

    beforeEach(() => {
      prevFaceEnv = process.env.FACE_DETECTION_ENABLED;
      process.env.FACE_DETECTION_ENABLED = "0";
    });

    afterEach(() => {
      if (prevFaceEnv === undefined) {
        delete process.env.FACE_DETECTION_ENABLED;
      } else {
        process.env.FACE_DETECTION_ENABLED = prevFaceEnv;
      }
    });

    const svc = () =>
      new UserImageDetectionService(mockDetector as never).withFaceDetector(
        mockDetector,
      );

    it("passed for a normal JPEG buffer (face detection off)", async () => {
      const buf = await sharpPatternJpegBuffer();
      const detectFaces = jest.fn();
      const r = await new UserImageDetectionService({ detectFaces } as never)
        .withFaceDetector({ detectFaces })
        .detectFromBuffer(buf);
      expect(r.status).toBe("passed");
      expect(r.scoreJson?.pipeline).toEqual(["quality"]);
      expect(detectFaces).not.toHaveBeenCalled();
    });

    it("failed TOO_DARK for near-black image", async () => {
      const buf = await sharp({
        create: {
          width: 200,
          height: 200,
          channels: 3,
          background: { r: 5, g: 5, b: 5 },
        },
      })
        .png()
        .toBuffer();
      const r = await svc().detectFromBuffer(buf);
      expect(r.status).toBe("failed");
      expect(r.reasonCodes).toContain("TOO_DARK");
    });

    it("failed TOO_BLUR for heavy blur", async () => {
      const buf = await sharp({
        create: {
          width: 200,
          height: 200,
          channels: 3,
          background: { r: 140, g: 140, b: 140 },
        },
      })
        .blur(25)
        .png()
        .toBuffer();
      const r = await svc().detectFromBuffer(buf);
      expect(r.status).toBe("failed");
      expect(r.reasonCodes).toContain("TOO_BLUR");
    });

    it("failed UNREADABLE_IMAGE for invalid buffer", async () => {
      const r = await svc().detectFromBuffer(Buffer.from("not-an-image"));
      expect(r.status).toBe("failed");
      expect(r.reasonCodes).toContain("UNREADABLE_IMAGE");
    });

    it("failed FACE_NOT_FOUND when face enabled and no faces", async () => {
      process.env.FACE_DETECTION_ENABLED = "1";
      const noFaceDetector: UserImageFaceDetector = {
        detectFaces: async () => ({ faceCount: 0, faces: [] }),
      };
      const buf = await sharpPatternJpegBuffer();
      const r = await new UserImageDetectionService(
        noFaceDetector as never,
      )
        .withFaceDetector(noFaceDetector)
        .detectFromBuffer(buf);
      expect(r.status).toBe("failed");
      expect(r.reasonCodes).toContain("FACE_NOT_FOUND");
    });

    it("passed with MULTIPLE_FACES warning when multiple faces", async () => {
      process.env.FACE_DETECTION_ENABLED = "1";
      const multiDetector: UserImageFaceDetector = {
        detectFaces: async () => ({
          faceCount: 2,
          faces: [
            { score: 0.9, box: { x: 0, y: 0, width: 40, height: 40 } },
            { score: 0.85, box: { x: 50, y: 0, width: 40, height: 40 } },
          ],
        }),
      };
      const buf = await sharpPatternJpegBuffer();
      const r = await new UserImageDetectionService(multiDetector as never)
        .withFaceDetector(multiDetector)
        .detectFromBuffer(buf);
      expect(r.status).toBe("passed");
      expect(r.scoreJson?.warnings).toContain("MULTIPLE_FACES");
    });

    it("skipped when face detector throws", async () => {
      process.env.FACE_DETECTION_ENABLED = "1";
      const failDetector: UserImageFaceDetector = {
        detectFaces: async () => {
          throw new Error("model load failed");
        },
      };
      const buf = await sharpPatternJpegBuffer();
      const r = await new UserImageDetectionService(failDetector as never)
        .withFaceDetector(failDetector)
        .detectFromBuffer(buf);
      expect(r.status).toBe("skipped");
    });

    it("laplacianVariance is higher on sharp pattern than flat gray", () => {
      const w = 32;
      const h = 32;
      const sharpGray = new Uint8Array(w * h);
      const flatGray = new Uint8Array(w * h).fill(128);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          sharpGray[y * w + x] = (x + y) % 2 === 0 ? 40 : 220;
        }
      }
      expect(laplacianVariance(sharpGray, w, h)).toBeGreaterThan(
        laplacianVariance(flatGray, w, h),
      );
    });
  });
});
