import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as tf from "@tensorflow/tfjs";
import * as blazeface from "@tensorflow-models/blazeface";
import {
  getFaceDetectionInferTimeoutMs,
  isFaceDetectionEnabled,
  raceWithTimeout,
  type FaceDetectionRgbInput,
  type FaceDetectionResult,
  type UserImageFaceDetector,
} from "./user-image-face-detection.adapter";

@Injectable()
export class BlazeFaceDetectorAdapter
  implements UserImageFaceDetector, OnModuleInit
{
  private readonly logger = new Logger(BlazeFaceDetectorAdapter.name);
  private model: blazeface.BlazeFaceModel | null = null;
  private loadPromise: Promise<blazeface.BlazeFaceModel> | null = null;

  onModuleInit(): void {
    if (!isFaceDetectionEnabled()) return;
    void this.warmup();
  }

  /** Fire-and-forget; failures do not block API startup. */
  warmup(): void {
    void this.getModel().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`face model warmup failed: ${msg}`);
    });
  }

  private async getModel(): Promise<blazeface.BlazeFaceModel> {
    if (this.model) return this.model;
    if (!this.loadPromise) {
      this.loadPromise = blazeface
        .load({ maxFaces: 10 })
        .then((loaded) => {
          this.model = loaded;
          return loaded;
        })
        .catch((err) => {
          this.loadPromise = null;
          throw err;
        });
    }
    return this.loadPromise;
  }

  async detectFaces(input: FaceDetectionRgbInput): Promise<FaceDetectionResult> {
    const { rgb, width, height } = input;
    if (width < 1 || height < 1 || rgb.length < width * height * 3) {
      return { faceCount: 0, faces: [] };
    }

    try {
      const model = await this.getModel();
      const tensor = tf.tensor3d(rgb, [height, width, 3]);
      try {
        const predictions = await raceWithTimeout(
          () => model.estimateFaces(tensor, false),
          getFaceDetectionInferTimeoutMs(),
        );
        const faces = predictions.map((p) => {
          const [x1, y1] = p.topLeft as [number, number];
          const [x2, y2] = p.bottomRight as [number, number];
          const score =
            typeof p.probability === "number"
              ? p.probability
              : Array.isArray(p.probability)
                ? (p.probability[0] ?? 0)
                : 0;
          return {
            score,
            box: {
              x: Math.max(0, Math.round(x1)),
              y: Math.max(0, Math.round(y1)),
              width: Math.max(0, Math.round(x2 - x1)),
              height: Math.max(0, Math.round(y2 - y1)),
            },
          };
        });
        return { faceCount: faces.length, faces };
      } finally {
        tensor.dispose();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`blaze face detection failed: ${msg}`);
      throw err;
    }
  }
}
