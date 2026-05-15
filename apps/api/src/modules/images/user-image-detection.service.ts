import { Injectable, Logger } from "@nestjs/common";
import sharp from "sharp";
import {
  evaluateExtremeQualityFromScores,
  laplacianVariance,
  meanLuminance,
  skippedDetectionResult,
  unreadableDetectionResult,
  type UserImageQualityDetectionResult,
} from "./user-image-quality-detection";

const SAMPLE_MAX_EDGE = 320;

@Injectable()
export class UserImageDetectionService {
  private readonly logger = new Logger(UserImageDetectionService.name);

  async detectFromBuffer(buffer: Buffer): Promise<UserImageQualityDetectionResult> {
    try {
      const pipeline = sharp(buffer, { failOn: "error" });
      const meta = await pipeline.metadata();
      if (!meta.width || !meta.height || meta.width < 1 || meta.height < 1) {
        return unreadableDetectionResult();
      }

      const { data, info } = await sharp(buffer)
        .resize(SAMPLE_MAX_EDGE, SAMPLE_MAX_EDGE, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const sampleWidth = info.width;
      const sampleHeight = info.height;
      const gray = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

      const scores = {
        width: meta.width,
        height: meta.height,
        meanLuma: meanLuminance(gray),
        laplacianVariance: laplacianVariance(gray, sampleWidth, sampleHeight),
        sampleWidth,
        sampleHeight,
      };

      return evaluateExtremeQualityFromScores(scores);
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
      return skippedDetectionResult();
    }
  }
}
