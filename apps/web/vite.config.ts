import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Load `VITE_*` from monorepo root `.env` (same as docker-compose build args).
const envDir = resolve(__dirname, "../..");

export default defineConfig({
  envDir,
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  // `vite preview` uses the `preview` block (and default port is 4173),
  // so we pin it to 5173 to match Docker / docker-compose mapping.
  preview: {
    port: 5173,
    host: true,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@peima/shared/constants": resolve(
        __dirname,
        "../../packages/shared/constants/index.ts",
      ),
    },
  },
});
