import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The on-device OCR model for "Import panel schedule" (src/lib/ocrEngine.js),
// served at a FIXED same-origin path: tesseract.js fetches
// `${langPath}/eng.traineddata.gz` by name, so it can't be a hashed asset. It's
// read straight from the installed npm package — nothing to stage, nothing
// committed — and emitted into dist/ at build (dev serves it from memory).
const OCR_MODEL = "ocr/eng.traineddata.gz";
function ocrModel() {
  const file = createRequire(import.meta.url).resolve("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz");
  return {
    name: "ocr-model",
    configureServer(server) {
      server.middlewares.use(`${server.config.base}${OCR_MODEL}`, (_req, res) => {
        res.setHeader("Content-Type", "application/octet-stream");
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: OCR_MODEL, source: readFileSync(file) });
    },
  };
}

// The one source of truth for the app version — package.json — inlined as
// __APP_VERSION__ so contributions can carry generator_version without a
// runtime fetch. Guarded with `typeof` at the use site so the Node test
// runner (no Vite, no define) sees plain undefined instead of a crash.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// OpenTakeoff is a client-only static app: the takeoff canvas runs entirely in
// the browser (pdf.js + canvas + the geometry libs), persists to IndexedDB /
// localStorage, and builds to a static `dist/` you can host anywhere (GitHub
// Pages, Vercel, Netlify, an S3 bucket).
//
// The `/ai` proxy is OPTIONAL — it only matters if you run the bring-your-own-
// model AI sandbox in `../server` (see server/README.md). Without it, the app
// works fully; the AI hooks just stay dormant.
export default defineConfig({
  plugins: [react(), ocrModel()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // The STT worker (stt.worker.ts, RFC #59) lazy-imports its engine adapter,
  // which needs code-splitting inside the worker bundle — only the ES format
  // supports that (Vite's default iife errors on split worker builds).
  worker: { format: "es" },
  server: {
    port: 5173,
    proxy: {
      // The sandbox's /ai routes are key-locked (server/README.md). Export the
      // same OT_SANDBOX_API_KEY in the shell running `npm run dev` and the
      // proxy stamps the header on — the browser never handles the secret.
      "/ai": {
        target: "http://localhost:8000",
        headers: process.env.OT_SANDBOX_API_KEY
          ? { "X-API-Key": process.env.OT_SANDBOX_API_KEY }
          : {},
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
