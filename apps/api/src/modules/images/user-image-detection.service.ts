import { Injectable, Logger } from "@nestjs/common";
import sharp from "sharp";
import { BlazeFaceDetectorAdapter } from "./blaze-face-detector.adapter";
import {
  isFaceDetectionEnabled,
  type UserImageFaceDetector,
} from "./user-image-face-detection.adapter";
import {
  evaluateExtremeQualityFromMetrics,
  laplacianVariance,
  meanLuminance,
  mergeQualityAndFaceDetection,
  qualityFailedResult,
  qualityMetricsToJson,
  skippedDetectionResult,
  unreadableDetectionResult,
  type UserImageDetectionResult,
  type UserImageFaceScoreFace,
} from "./user-image-quality-detection";

const SAMPLE_MAX_EDGE = 320;
const FACE_RGB_MAX_EDGE = 640;

@Injectable()
export class UserImageDetectionService {
  private readonly logger = new Logger(UserImageDetectionService.name);

  constructor(private readonly faceDetector: BlazeFaceDetectorAdapter) {}

  /** @internal tests may inject a mock detector */
  withFaceDetector(detector: UserImageFaceDetector): UserImageDetectionService {
    return new UserImageDetectionService(detector as BlazeFaceDetectorAdapter);
  }

  async detectFromBuffer(buffer: Buffer): Promise<UserImageDetectionResult> {
    try {
      const meta = await sharp(buffer, { failOn: "error" }).metadata();
      if (!meta.width || !meta.height || meta.width < 1 || meta.height < 1) {
        return unreadableDetectionResult();
      }

      const { data: grayBuf, info: grayInfo } = await sharp(buffer)
        .resize(SAMPLE_MAX_EDGE, SAMPLE_MAX_EDGE, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const sampleWidth = grayInfo.width;
      const sampleHeight = grayInfo.height;
      const gray = new Uint8Array(
        grayBuf.buffer,
        grayBuf.byteOffset,
        grayBuf.byteLength,
      );

      const metrics = {
        width: meta.width,
        height: meta.height,
        meanLuma: meanLuminance(gray),
        laplacianVariance: laplacianVariance(gray, sampleWidth, sampleHeight),
        sampleWidth,
        sampleHeight,
      };

      const { reasonCodes, failed } = evaluateExtremeQualityFromMetrics(metrics);
      if (failed) {
        return qualityFailedResult(metrics, reasonCodes);
      }

      const faceEnabled = isFaceDetectionEnabled();
      if (!faceEnabled) {
        return mergeQualityAndFaceDetection({
          metrics,
          faceCount: 0,
          faces: [],
          faceDetectionEnabled: false,
        });
      }

      try {
        const { data: rgbBuf, info: rgbInfo } = await sharp(buffer)
          .resize(FACE_RGB_MAX_EDGE, FACE_RGB_MAX_EDGE, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const rgb = new Uint8Array(
          rgbBuf.buffer,
          rgbBuf.byteOffset,
          rgbBuf.byteLength,
        );

        const faceResult = await this.faceDetector.detectFaces({
          rgb,
          width: rgbInfo.width,
          height: rgbInfo.height,
        });

        const faces: UserImageFaceScoreFace[] = faceResult.faces.map((f) => ({
          score: f.score,
          box: f.box,
        }));

        return mergeQualityAndFaceDetection({
          metrics,
          faceCount: faceResult.faceCount,
          faces,
          faceDetectionEnabled: true,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`face detection skipped after quality pass: ${msg}`);
        return skippedDetectionResult({
          quality: qualityMetricsToJson(metrics),
          pipeline: ["quality"],
          faceDetectionEnabled: true,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("Input buffer") ||
        msg.includes("unsupported") ||
        msg.includes("Vips") ||
        msg.includes("corrupt") ||
        msg.includes("invalid")
      ) {
        return unreadableDetectionResult();
      }
      this.logger.warn(`image detection skipped: ${msg}`);
      return skippedDetectionResult(null);
    }
  }
}
