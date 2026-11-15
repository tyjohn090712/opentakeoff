// Symbol search worker (electrical fork) — autocount's heavy geometry off the
// page. A dense sheet searched for turned and mirrored copies is seconds of
// pure math per sheet (measured ~4–5 s per real E sheet in Node, far longer
// on the page), and it must never freeze the canvas. The canvas sends each
// sheet's segments once ("segs") and then asks for sweeps and matches by key.
import { sweepSymbols, matchSymbol, fingerprintSymbol } from "./symbolsweep";

const sheets = new Map();   // key → { segs, lum }
self.onmessage = (ev) => {
  const m = ev.data;
  try {
    if (m.type === "segs") { sheets.set(m.key, { segs: m.segs, lum: m.lum || null }); self.postMessage({ type: "ok", req: m.req }); return; }
    const g = sheets.get(m.key);
    if (!g) { self.postMessage({ type: "error", req: m.req, error: "sheet not loaded" }); return; }
    const opts = { ...(m.opts || {}), ...(g.lum ? { lum: g.lum } : {}) };
    if (m.type === "sweep") self.postMessage({ type: "sweep", req: m.req, res: sweepSymbols(g.segs, m.rect, opts) });
    else if (m.type === "fingerprint") self.postMessage({ type: "fingerprint", req: m.req, res: fingerprintSymbol(g.segs, m.rect, g.lum || undefined) });
    else if (m.type === "match") self.postMessage({ type: "match", req: m.req, res: matchSymbol(m.fp, g.segs, opts) });
  } catch (e) {
    // the engine's refusals (empty marquee, region-sized marquee) are instructions
    self.postMessage({ type: "error", req: m.req, error: String((e && e.message) || e) });
  }
};
