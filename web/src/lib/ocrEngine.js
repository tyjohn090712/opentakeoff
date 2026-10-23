// On-device OCR (tesseract.js) for the panel-schedule reader — browser only.
// Everything ships with the app and is fetched same-origin on first use: the
// worker script, the WebAssembly core, and the English model (~7 MB together,
// none of it in the main bundle). No CDN, no upload — the plan never leaves
// the machine, which is the point for drawings under NDA.
//
// CSP (web/public/_headers): the worker loads from 'self' (worker-src), the
// core compiles under 'wasm-unsafe-eval', the model is a same-origin fetch.
// workerBlobURL:false keeps the worker a plain same-origin script, so nothing
// here needs a blob: script or a third-party origin. The model sits at a fixed
// path (/ocr/eng.traineddata.gz — the ocr-model plugin in vite.config.js):
// tesseract.js 5 loads languages BY NAME from langPath (handing it the bytes
// directly trips a bug in its init, which then uses the bytes as the name).
import workerUrl from "tesseract.js/dist/worker.min.js?url";
import coreUrl from "tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url";

let workerP = null;

/** The one shared OCR worker, created on first use (a failed start retries next time). */
export function getOcrWorker() {
  if (!workerP) {
    workerP = (async () => {
      const { createWorker } = await import("tesseract.js");
      const abs = (u) => new URL(u, window.location.href).href;
      return createWorker("eng", 1, {
        workerPath: abs(workerUrl), corePath: abs(coreUrl), langPath: abs(`${import.meta.env.BASE_URL}ocr`),
        workerBlobURL: false, cacheMethod: "none", gzip: true,
      });
    })().catch((e) => { workerP = null; throw e; });
  }
  return workerP;
}

const MARGIN = 12;   // white border around every read — glyphs touching an image edge misread
const PSM = { sparse: "11", block: "6", line: "7" };

/**
 * A panelOcr `Recognize` over two prepared rasters of the same region:
 * `bin` (binarized, rules erased) for the sparse and column-strip reads,
 * `gray` (shading lifted, ink kept gray) for single-cell second looks.
 * Each is { data: Uint8Array grayscale, w, h }.
 */
export function makeRecognizer(worker, { bin, gray }) {
  return async (rect, mode) => {
    const src = mode === "line" ? gray : bin;
    const w = Math.max(1, Math.min(rect.width, src.w - rect.left)), h = Math.max(1, Math.min(rect.height, src.h - rect.top));
    const canvas = document.createElement("canvas");
    canvas.width = w + 2 * MARGIN; canvas.height = h + 2 * MARGIN;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const row = (rect.top + y) * src.w + rect.left;
      for (let x = 0; x < w; x++) {
        const v = src.data[row + x], j = (y * w + x) * 4;
        img.data[j] = img.data[j + 1] = img.data[j + 2] = v; img.data[j + 3] = 255;
      }
    }
    ctx.putImageData(img, MARGIN, MARGIN);
    await worker.setParameters({ tessedit_pageseg_mode: PSM[mode] });
    const { data } = await worker.recognize(canvas);
    const list = (mode === "sparse" ? data.words : data.lines) || [];
    return list.map((b) => ({
      text: b.text,
      x0: b.bbox.x0 - MARGIN + rect.left, y0: b.bbox.y0 - MARGIN + rect.top,
      x1: b.bbox.x1 - MARGIN + rect.left, y1: b.bbox.y1 - MARGIN + rect.top,
    }));
  };
}
