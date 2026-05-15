/**
 * P7.4-r1b runtime check — BlazeFace + UserImageDetectionService (no DB).
 *
 * From repo root (or apps/api):
 *   pnpm --filter @peima/api build   # if dist missing
 *   pnpm --filter @peima/api run p74:r1b-face-runtime-check
 *
 * Env:
 *   FACE_DETECTION_ENABLED=1|0
 *   FACE_DETECTION_INFER_TIMEOUT_MS  (default 8000)
 *   --face-url=<https>          single-face sample
 *   --multi-face-url=<https>    optional multi-face sample
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";
import sharp from "sharp";
import * as tf from "@tensorflow/tfjs";
import * as blazeface from "@tensorflow-models/blazeface";

const apiRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(apiRoot, "../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const DEFAULT_INFER_TIMEOUT_MS = 8000;
const inferTimeoutMs = (() => {
  const raw = process.env.FACE_DETECTION_INFER_TIMEOUT_MS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_INFER_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_INFER_TIMEOUT_MS;
})();
const faceEnabled = process.env.FACE_DETECTION_ENABLED !== "0";

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function fetchBuffer(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function sharpPatternJpeg() {
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

async function runDetection(svc, buf, label) {
  const t0 = Date.now();
  const r = await svc.detectFromBuffer(buf);
  return {
    label,
    elapsedMs: Date.now() - t0,
    status: r.status,
    reasonCodes: r.reasonCodes,
    rulesVersion: r.rulesVersion,
    pipeline: r.scoreJson?.pipeline,
    faceCount: r.scoreJson?.face?.faceCount,
    warnings: r.scoreJson?.warnings ?? [],
    faceDetectionEnabled: r.scoreJson?.faceDetectionEnabled,
  };
}

async function main() {
  const defaultFaceUrl =
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80";
  const defaultMultiUrl =
    "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=640&q=80";

  const report = {
    nodeVersion: process.version,
    faceDetectionEnabled: faceEnabled,
    faceDetectionInferTimeoutMs: inferTimeoutMs,
    tfBackend: tf.getBackend() ?? "(cpu wasm default)",
    blazeFaceLoadOnly: null,
    blazeFaceInferOnly: null,
    detection: [],
    notes: [],
    errors: [],
  };

  try {
    const tLoad = Date.now();
    const model = await blazeface.load({ maxFaces: 10 });
    report.blazeFaceLoadOnly = { ok: true, ms: Date.now() - tLoad };
    if (report.blazeFaceLoadOnly.ms >= inferTimeoutMs) {
      report.notes.push(
        `Model cold load (${report.blazeFaceLoadOnly.ms}ms) exceeds infer timeout (${inferTimeoutMs}ms) — unusual; load is no longer capped by infer timeout (P7.4-r1b-f1).`,
      );
    }

    const faceUrl = argValue("face-url") ?? defaultFaceUrl;
    const faceBuf = await fetchBuffer(faceUrl, "face-url");
    const { data, info } = await sharp(faceBuf)
      .resize(640, 640, { fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rgb = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const tensor = tf.tensor3d(rgb, [info.height, info.width, 3]);
    const tInfer = Date.now();
    const preds = await model.estimateFaces(tensor, false);
    tensor.dispose();
    report.blazeFaceInferOnly = {
      ok: true,
      ms: Date.now() - tInfer,
      faceCount: preds.length,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!report.blazeFaceLoadOnly) report.blazeFaceLoadOnly = { ok: false, error: msg };
    else report.blazeFaceInferOnly = { ok: false, error: msg };
    report.errors.push(msg);
  }

  if (!faceEnabled) {
    report.notes.push("FACE_DETECTION_ENABLED=0 — service path skips face; only r1a quality runs.");
  }

  try {
    const { UserImageDetectionService } = await import(
      "../dist/modules/images/user-image-detection.service.js"
    );
    const { BlazeFaceDetectorAdapter } = await import(
      "../dist/modules/images/blaze-face-detector.adapter.js"
    );
    const svc = new UserImageDetectionService(new BlazeFaceDetectorAdapter());

    const patternBuf = await sharpPatternJpeg();
    report.detection.push(await runDetection(svc, patternBuf, "pattern_no_face_cold"));

    const faceUrl = argValue("face-url") ?? defaultFaceUrl;
    const faceBuf = await fetchBuffer(faceUrl, "face-url");
    report.detection.push(await runDetection(svc, faceBuf, "sample_face_warmup"));
    report.detection.push(await runDetection(svc, patternBuf, "pattern_no_face_warm"));
    report.detection.push(await runDetection(svc, faceBuf, "sample_face_cold"));
    report.detection.push(await runDetection(svc, faceBuf, "sample_face_warm"));

    try {
      const multiUrl = argValue("multi-face-url") ?? defaultMultiUrl;
      const multiBuf = await fetchBuffer(multiUrl, "multi-face-url");
      report.detection.push(
        await runDetection(svc, multiBuf, "sample_multi_face"),
      );
    } catch (e) {
      report.errors.push(
        `multi-face sample: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  } catch (e) {
    report.errors.push(e instanceof Error ? e.message : String(e));
  }

  report.notes.push(
    'Jest WARN "model load failed" comes from test "skipped when face detector throws" (intentional mock), not BlazeFace.',
  );

  console.log(JSON.stringify(report, null, 2));

  const patternCold = report.detection.find((d) => d.label === "pattern_no_face_cold");
  const patternWarm = report.detection.find((d) => d.label === "pattern_no_face_warm");
  const faceCold = report.detection.find((d) => d.label === "sample_face_cold");
  const faceWarm = report.detection.find((d) => d.label === "sample_face_warm");
  const multi = report.detection.find((d) => d.label === "sample_multi_face");

  const summary = {
    blazeFaceLoadsInNode: report.blazeFaceLoadOnly?.ok === true,
    loadMs: report.blazeFaceLoadOnly?.ms,
    inferMs: report.blazeFaceInferOnly?.ms,
    inferFaceCount: report.blazeFaceInferOnly?.faceCount,
    patternColdFaceNotFound:
      patternCold?.status === "failed" &&
      patternCold.reasonCodes?.includes("FACE_NOT_FOUND"),
    patternColdSkipped: patternCold?.status === "skipped",
    patternWarmFaceNotFound:
      patternWarm?.status === "failed" &&
      patternWarm.reasonCodes?.includes("FACE_NOT_FOUND"),
    sampleFacePassed:
      faceWarm?.status === "passed" && (faceWarm.faceCount ?? 0) >= 1,
    sampleFaceColdSkipped: faceCold?.status === "skipped",
    multiFaceWarning: multi?.warnings?.includes("MULTIPLE_FACES") ?? false,
    multiFaceCount: multi?.faceCount,
  };

  console.log("\n--- summary ---");
  console.log(JSON.stringify(summary, null, 2));

  const ok =
    summary.blazeFaceLoadsInNode &&
    summary.sampleFacePassed &&
    summary.patternColdFaceNotFound &&
    !summary.patternColdSkipped &&
    summary.patternWarmFaceNotFound &&
    report.errors.length === 0;
  process.exitCode = ok ? 0 : 1;
}

main();
