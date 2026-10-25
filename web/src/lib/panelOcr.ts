// On-device OCR reader for panel schedules on scanned or flattened sheets (no
// text layer). The OCR engine is INJECTED (`recognize`) so this orchestration
// stays pure and node-testable; the canvas supplies a tesseract.js worker
// (lib/ocrEngine.js) — everything runs in the browser, nothing is uploaded.
//
// Why two passes: OCR'ing a whole table at once loses the short cell values a
// panel schedule is made of — lone "1"s in POLES, the even circuit numbers —
// because sparse text detection skips isolated digits. Reading ONE column at a
// time (a uniform block of short lines) recovers them reliably. So:
//   1. one sparse pass over the region → the title, header ratings, and the
//      column header words (enough for panelLayout to find the columns);
//   2. per needed column (CKT, DESCRIPTION, TRIP, POLES on each side), a block
//      read of that column's strip below the header → one token per line.
// The tokens then go to the same parsePanelSchedule the vector path uses.

import { panelLayout, parseTrip, parsePoles, STANDARD_TRIPS, type Token } from "./panelSchedule.js";
import type { Rule } from "./panelRaster.js";

export type OcrBox = { text: string; x0: number; y0: number; x1: number; y1: number };
export type OcrRect = { left: number; top: number; width: number; height: number };
/**
 * sparse → word boxes over the rect; block → line boxes; line → the rect read
 * as ONE line. Region px in, region px out. The engine should read the rect
 * with a white margin around it — glyphs touching an image edge misread.
 */
export type Recognize = (rect: OcrRect, mode: "sparse" | "block" | "line") => Promise<OcrBox[]>;

const toToken = (b: OcrBox): Token | null => {
  const str = (b.text || "").replace(/\s+/g, " ").trim();
  if (!str) return null;
  return { str, x: b.x0, y: b.y1, h: Math.max(1, b.y1 - b.y0), w: Math.max(1, b.x1 - b.x0) };
};

/**
 * Read a panel schedule region by OCR. `w`/`h` are the raster's size; `rules`
 * its vertical rules (panelRaster.findVerticalRules). Returns the tokens to
 * parse — or the sparse pass alone when no circuit table header is found, so
 * the parser can say so honestly.
 */
export async function readPanelTokens(
  w: number, h: number, rules: Rule[], recognize: Recognize,
  onProgress?: (done: number, total: number) => void,
): Promise<Token[]> {
  const sparse = (await recognize({ left: 0, top: 0, width: w, height: h }, "sparse"))
    .map(toToken).filter((t): t is Token => !!t);
  const lay = panelLayout(sparse, { rules });
  if ("error" in lay) return sparse;

  // strips start just under the header band, run to the region's bottom; the
  // CKT strips go first — where their numbers stop is where the table stops
  const top = Math.min(h - 1, Math.round(lay.header.bottom + 0.35 * lay.header.h));
  const pad = 2;
  const stripRect = (ci: number, bottom: number): OcrRect | null => {
    const c = lay.cols[ci];
    const left = Math.max(0, Math.round(c.x0 + pad)), right = Math.min(w, Math.round(c.x1 - pad));
    if (right - left < 4 || bottom - top < 4) return null;
    return { left, top, width: right - left, height: Math.round(bottom - top) };
  };
  const cktCols = [...new Set(lay.sides.map((s) => lay.pick[s].ckt).filter((i): i is number => i !== undefined))];
  const otherCols = [...new Set(lay.sides.flatMap((s) => (["desc", "trip", "poles"] as const).map((r) => lay.pick[s][r])).filter((i): i is number => i !== undefined))]
    .filter((i) => !cktCols.includes(i));
  const total = cktCols.length + otherCols.length;
  let done = 0;
  const strips: { ci: number; rect: OcrRect; toks: Token[] }[] = [];

  let tableBottom = top;
  for (const ci of cktCols) {
    const rect = stripRect(ci, h);
    onProgress?.(++done, total);
    if (!rect) continue;
    const toks = (await recognize(rect, "block")).map(toToken).filter((t): t is Token => !!t);
    // the last line that is plainly a circuit number ends the table
    let lastY = top;
    for (const t of toks) if (/^\d{1,3}$/.test(t.str.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1")) && t.y > lastY) lastY = t.y;
    tableBottom = Math.max(tableBottom, lastY);
    strips.push({ ci, rect, toks });
  }
  // allow half a row past the last number for a merged cell's centered text
  const rowPitch = lay.header.h * 1.6;
  const bottom = Math.min(h, Math.round(tableBottom + rowPitch));
  for (const s of strips) s.toks = s.toks.filter((t) => t.y - t.h <= bottom);
  // panel schedules are written in capitals; OCR's mixed case ("Cu-1",
  // "cu4" for CU-1, CU-4) is noise, so read descriptions are upper-cased
  const descCols = new Set(lay.sides.map((s) => lay.pick[s].desc));
  for (const ci of otherCols) {
    const rect = stripRect(ci, bottom);
    onProgress?.(++done, total);
    if (!rect) continue;
    const toks = (await recognize(rect, "block")).map(toToken).filter((t): t is Token => !!t);
    if (descCols.has(ci)) for (const t of toks) t.str = t.str.toUpperCase();
    strips.push({ ci, rect, toks });
  }

  // Second look at implausible cells. Block reads occasionally fumble one line
  // ("0A" for "30A" next to a "--" row) or drop it; read that single cell as a
  // line. Implausible = a TRIP that isn't a standard rating, POLES that aren't
  // 1–3, or nothing at all on a row whose DESCRIPTION names something.
  const dashy = (s: string) => !/[A-Z0-9]/i.test(s);
  const plausible: Record<string, (s: string) => boolean> = {
    trip: (s) => dashy(s) || (() => { const t = parseTrip(s); return !!t && STANDARD_TRIPS.has(t.trip); })(),
    poles: (s) => dashy(s) || parsePoles(s) !== null,
  };
  const lineH = lay.header.h;
  for (const sd of lay.sides) {
    const descStrip = strips.find((st) => st.ci === lay.pick[sd].desc);
    for (const role of ["trip", "poles"] as const) {
      const st = strips.find((x) => x.ci === lay.pick[sd][role]);
      if (!st) continue;
      const ys = new Set<number>();
      for (const t of st.toks) if (!plausible[role](t.str)) ys.add(t.y);
      for (const d of descStrip?.toks ?? []) {
        if (dashy(d.str) || /\bSPACE\b/i.test(d.str)) continue;
        // "near" reaches 1.6 line heights: one breaker serves a whole merged cell,
        // so a two-line description has ONE size, centered between its lines. The
        // next row's cell is ≥ 1.9 line heights away, so it doesn't mask a miss.
        if (!st.toks.some((t) => Math.abs(t.y - d.y) < 1.6 * lineH)) ys.add(d.y);
      }
      for (const y of ys) {
        const rect = { left: st.rect.left, top: Math.max(0, Math.round(y - 1.5 * lineH)), width: st.rect.width, height: Math.round(2 * lineH) };
        const got = (await recognize(rect, "line")).map(toToken).filter((t): t is Token => !!t);
        const text = got.map((t) => t.str).join(" ").trim();
        if (!text || !plausible[role](text) || dashy(text)) continue;
        // a cell can be asked about twice (once per line of its description):
        // an identical reading already within one cell's reach is the same cell
        if (st.toks.some((t) => Math.abs(t.y - y) < 1.6 * lineH && t.str.replace(/\s+/g, "") === text.replace(/\s+/g, "") && plausible[role](t.str) && !dashy(t.str))) continue;
        st.toks = st.toks.filter((t) => Math.abs(t.y - y) >= 0.6 * lineH);
        st.toks.push({ str: text, x: rect.left, y, h: lineH, w: rect.width });
      }
    }
  }

  // sparse tokens survive everywhere a strip didn't read (title, ratings, the
  // other columns, anything below the table); inside a strip the strip wins
  const inStrip = (t: Token) => strips.some(({ rect }) => {
    const cx = t.x + (t.w ?? 0) / 2, cy = t.y - t.h / 2;
    return cx >= rect.left && cx <= rect.left + rect.width && cy >= rect.top && cy <= bottom;
  });
  return [...sparse.filter((t) => !inStrip(t)), ...strips.flatMap((s) => s.toks)];
}
