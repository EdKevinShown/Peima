/**
 * CJS bundles for worker + tests (bundles API pairwise modules; keeps `@peima/database` external).
 */
import esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: {
    index: path.join(__dirname, "src/index.ts"),
    "worker-consumer": path.join(__dirname, "src/worker-consumer.ts"),
  },
  outdir: path.join(__dirname, "dist"),
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["@peima/database"],
  logLevel: "info",
  sourcemap: true,
});
