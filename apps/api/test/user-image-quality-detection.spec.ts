import {
  evaluateExtremeQualityFromScores,
  EXTREME_MAX_LAPLACIAN_VARIANCE,
  EXTREME_MIN_MEAN_LUMA,
  laplacianVariance,
  unreadableDetectionResult,
  USER_IMAGE_DETECTION_RULES_VERSION,
} from "../src/modules/images/user-image-quality-detection";
import { UserImageDetectionService } from "../src/modules/images/user-image-detection.service";
import sharp from "sharp";

describe("user-image-quality-detection (P7.4-r1a)", () => {
  describe("evaluateExtremeQualityFromScores", () => {
    const base = {
      width: 800,
      height: 600,
      sampleWidth: 320,
      sampleHeight: 240,
    };

    it("passed for normal brightness and sharpness", () => {
      const r = evaluateExtremeQualityFromScores({
        ...base,
        meanLuma: 120,
        laplacianVariance: 80,
      });
      expect(r.status).toBe("passed");
      expect(r.reasonCodes).toEqual([]);
    });

    it("failed with TOO_DARK when mean luma below threshold", () => {
      const r = evaluateExtremeQualityFromScores({
        ...base,
        meanLuma: EXTREME_MIN_MEAN_LUMA - 1,
        laplacianVariance: 80,
      });
      expect(r.status).toBe("failed");
      expect(r.reasonCodes).toContain("TOO_DARK");
    });

    it("failed with TOO_BLUR when laplacian variance below threshold", () => {
      const r = evaluateExtremeQualityFromScores({
        ...base,
        meanLuma: 100,
        laplacianVariance: EXTREME_MAX_LAPLACIAN_VARIANCE - 0.01,
      });
      expect(r.status).toBe("failed");
      expect(r.reasonCodes).toContain("TOO_BLUR");
    });

    it("unreadable helper returns UNREADABLE_IMAGE", () => {
      const r = unreadableDetectionResult();
      expect(r.status).toBe("failed");
      expect(r.reasonCodes).toEqual(["UNREADABLE_IMAGE"]);
      expect(r.rulesVersion).toBe(USER_IMAGE_DETECTION_RULES_VERSION);
    });
  });

  describe("UserImageDetectionService.detectFromBuffer", () => {
    const svc = new UserImageDetectionService();

    it("passed for a normal JPEG buffer", async () => {
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
      const buf = await sharp(svg).jpeg({ quality: 90 }).toBuffer();
      const r = await svc.detectFromBuffer(buf);
      expect(r.status).toBe("passed");
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
      const r = await svc.detectFromBuffer(buf);
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
      const r = await svc.detectFromBuffer(buf);
      expect(r.status).toBe("failed");
      expect(r.reasonCodes).toContain("TOO_BLUR");
    });

    it("failed UNREADABLE_IMAGE for invalid buffer", async () => {
      const r = await svc.detectFromBuffer(Buffer.from("not-an-image"));
      expect(r.status).toBe("failed");
      expect(r.reasonCodes).toContain("UNREADABLE_IMAGE");
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
