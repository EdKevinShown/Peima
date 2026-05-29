/**
 * Builds CJS bundles for:
 * - `dist/index.js` — API / Nest runtime (no .ts via paths)
 * - `dist/worker-consumer.js` — worker process (CJS avoids ESM dynamic-require issues with Nest)
 *
 * Only `@peima/database` stays external (Prisma / native); other deps (incl. `@nestjs/*`)
 * are bundled so `dist/*.js` resolves when loaded from this package directory under pnpm.
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
