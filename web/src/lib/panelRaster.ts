// The table's vertical rules, for the panel-schedule parser (lib/panelSchedule.ts).
// PURE and DOM-free (node-testable): the canvas hands in either the page's
// vector segments or the grayscale pixels of the marqueed region, and gets
// back region-local rules {x, y0, y1}. Rules carry their y extent so the
// parser can keep only those that cross the circuit table's header row — a
// load-summary table drawn below the circuits has its own columns, and its
// rules must never split a circuit column.

export type Rule = { x: number; y0: number; y1: number };

// Merge pieces of one rule: same x (within xTol), touching or overlapping in y
// (within yGap). Cells drawn as separate rectangles, a 2–3 px thick scanned
// line, or a slightly skewed scan all arrive as many short pieces.
function mergeRules(pieces: Rule[], xTol: number, yGap: number): Rule[] {
  const ps = pieces.map((p) => ({ ...p, len: p.y1 - p.y0, wx: p.x * (p.y1 - p.y0 + 1) }))
    .sort((a, b) => a.x - b.x || a.y0 - b.y0);
  const out: { x: number; y0: number; y1: number; len: number; wx: number }[] = [];
  for (const p of ps) {
    let hit = null;
    for (let i = out.length - 1; i >= 0; i--) {
      const o = out[i];
      if (p.x - o.x > xTol) break;
      if (p.y0 <= o.y1 + yGap && p.y1 >= o.y0 - yGap) { hit = o; break; }
    }
    if (hit) {
      hit.y0 = Math.min(hit.y0, p.y0); hit.y1 = Math.max(hit.y1, p.y1);
      hit.wx += p.wx; hit.len += p.len + 1;
      hit.x = hit.wx / hit.len;
    } else out.push({ ...p, len: p.len + 1 });
  }
  return out.map(({ x, y0, y1 }) => ({ x, y0, y1 }));
}

/**
 * Vertical rules in a grayscale raster (row-major, 0 = black). A column pixel
 * counts as ink if it or a horizontal neighbour is darker than `dark` (absorbs
 * anti-aliasing and ~1px of skew); runs bridge gaps up to `gap` px (JPEG
 * speckle, a crossing text stroke's halo). Glyph strokes are short, so runs
 * under `minLen` are dropped.
 */
export function findVerticalRules(
  gray: Uint8Array, w: number, h: number,
  opts: { dark?: number; gap?: number; minLen?: number } = {},
): Rule[] {
  const dark = opts.dark ?? 150;
  const gap = opts.gap ?? 3;
  const minLen = opts.minLen ?? Math.max(24, Math.round(h * 0.04));
  const pieces: Rule[] = [];
  for (let x = 0; x < w; x++) {
    let start = -1, last = -1;
    for (let y = 0; y < h; y++) {
      const i = y * w + x;
      const ink = gray[i] < dark || (x > 0 && gray[i - 1] < dark) || (x + 1 < w && gray[i + 1] < dark);
      if (!ink) continue;
      if (start < 0) start = y;
      else if (y - last > gap + 1) {
        if (last - start + 1 >= minLen) pieces.push({ x, y0: start, y1: last });
        start = y;
      }
      last = y;
    }
    if (start >= 0 && last - start + 1 >= minLen) pieces.push({ x, y0: start, y1: last });
  }
  return mergeRules(pieces, 4, gap * 2);
}

/**
 * Vertical rules from vector linework: flat [x1,y1,x2,y2,…] segments in the
 * same px space as `rect` (lib/oneclick extractVectorGeometry's segs). Returns
 * region-local rules (origin at the rect's top-left), merged across cell
 * borders drawn as separate strokes.
 */
export function rulesFromSegments(
  segs: ArrayLike<number>,
  rect: { x0: number; y0: number; x1: number; y1: number },
  opts: { minLen?: number } = {},
): Rule[] {
  const x0 = Math.min(rect.x0, rect.x1), x1 = Math.max(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1), y1 = Math.max(rect.y0, rect.y1);
  const pieces: Rule[] = [];
  for (let i = 0; i + 3 < segs.length; i += 4) {
    const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
    if (Math.abs(ax - bx) > 0.75) continue;
    const x = (ax + bx) / 2;
    if (x < x0 || x > x1) continue;
    const s0 = Math.max(y0, Math.min(ay, by)), s1 = Math.min(y1, Math.max(ay, by));
    if (s1 - s0 < 2) continue;
    pieces.push({ x: x - x0, y0: s0 - y0, y1: s1 - y0 });
  }
  const minLen = opts.minLen ?? Math.max(12, (y1 - y0) * 0.04);
  return mergeRules(pieces, 1, 2).filter((r) => r.y1 - r.y0 >= minLen);
}

/**
 * Horizontal rules from vector linework, region-local, with cell-by-cell
 * borders merged along x (a row border drawn one cell at a time is one rule).
 * Only the segments' y and x-extent are kept: the parser asks which rules
 * cross a given column.
 */
export function hRulesFromSegments(
  segs: ArrayLike<number>,
  rect: { x0: number; y0: number; x1: number; y1: number },
  opts: { minLen?: number } = {},
): HRule[] {
  const x0 = Math.min(rect.x0, rect.x1), x1 = Math.max(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1), y1 = Math.max(rect.y0, rect.y1);
  const pieces: HRule[] = [];
  for (let i = 0; i + 3 < segs.length; i += 4) {
    const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
    if (Math.abs(ay - by) > 0.75) continue;
    const y = (ay + by) / 2;
    if (y < y0 || y > y1) continue;
    const s0 = Math.max(x0, Math.min(ax, bx)), s1 = Math.min(x1, Math.max(ax, bx));
    if (s1 - s0 < 2) continue;
    pieces.push({ y: y - y0, x0: s0 - x0, x1: s1 - x0 });
  }
  // cluster pieces into rows by y first (a border drawn cell by cell can jitter
  // a fraction of a pixel), then merge along x inside each — order-independent
  pieces.sort((a, b) => a.y - b.y);
  const clusters: HRule[][] = [];
  for (const p of pieces) {
    const last = clusters[clusters.length - 1];
    const mean = last ? last.reduce((a, q) => a + q.y, 0) / last.length : 0;
    if (last && p.y - mean <= 1) last.push(p); else clusters.push([p]);
  }
  const out: HRule[] = [];
  for (const cl of clusters) {
    const y = cl.reduce((a, q) => a + q.y, 0) / cl.length;
    cl.sort((a, b) => a.x0 - b.x0);
    let cur: HRule | null = null;
    for (const q of cl) {
      if (cur && q.x0 <= cur.x1 + 2) cur.x1 = Math.max(cur.x1, q.x1);
      else { cur = { y, x0: q.x0, x1: q.x1 }; out.push(cur); }
    }
  }
  const minLen = opts.minLen ?? 8;
  return out.filter((h) => h.x1 - h.x0 >= minLen);
}

/** RGBA (canvas ImageData) → grayscale bytes, luma-weighted. */
export function toGray(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) {
    g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
  }
  return g;
}

export type HRule = { y: number; x0: number; x1: number };

/** Horizontal rules — findVerticalRules on the transposed raster. */
export function findHorizontalRules(
  gray: Uint8Array, w: number, h: number,
  opts: { dark?: number; gap?: number; minLen?: number } = {},
): HRule[] {
  const t = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t[x * h + y] = gray[y * w + x];
  return findVerticalRules(t, h, w, { minLen: opts.minLen ?? Math.max(24, Math.round(w * 0.04)), ...opts })
    .map((r) => ({ y: r.x, x0: r.y0, x1: r.y1 }));
}

/**
 * The raster OCR actually reads well, with the table's rules erased —
 * Tesseract reads ruled tables badly, gluing rules to digits ("[1", "|20A")
 * and inventing glyphs along them. Each rule is erased only where its ink is a
 * thin run (≤ maxThick px) around the rule, so a glyph touching it keeps its
 * body. Two flavors, because each wins somewhere on real sheets:
 *   binarize (default) — pure black on white; shading drops out. Best for the
 *     whole-region and column-strip reads.
 *   binarize:false — paper and shading (~215 gray) lifted to white, ink kept
 *     GRAY. A hard threshold jags narrow-font digits enough that a clean
 *     "30 A" reads "0A"; the single-cell second look reads this one.
 */
export function cleanForOcr(
  gray: Uint8Array, w: number, h: number, vRules: Rule[], hRules: HRule[],
  opts: { dark?: number; lift?: number; maxThick?: number; reach?: number; binarize?: boolean } = {},
): Uint8Array {
  const dark = opts.dark ?? 150, lift = opts.lift ?? 185, maxThick = opts.maxThick ?? 8, reach = opts.reach ?? 6;
  const out = new Uint8Array(w * h);
  if (opts.binarize === false) for (let i = 0; i < out.length; i++) out[i] = gray[i] > lift ? 255 : gray[i];
  else for (let i = 0; i < out.length; i++) out[i] = gray[i] < dark ? 0 : 255;
  const ink = (i: number) => out[i] < dark;
  for (const r of vRules) {
    const cx = Math.round(r.x);
    for (let y = Math.max(0, Math.floor(r.y0)); y <= Math.min(h - 1, Math.ceil(r.y1)); y++) {
      const row = y * w;
      // nearest ink to the rule's x on this row, then its run
      let x = -1;
      for (let d = 0; d <= reach && x < 0; d++) {
        if (cx - d >= 0 && ink(row + cx - d)) x = cx - d;
        else if (cx + d < w && ink(row + cx + d)) x = cx + d;
      }
      if (x < 0) continue;
      let a = x, b = x;
      while (a > 0 && ink(row + a - 1)) a--;
      while (b < w - 1 && ink(row + b + 1)) b++;
      // the run's anti-aliased fringe goes too, or a ghost line survives
      if (b - a + 1 <= maxThick) for (let k = Math.max(0, a - 1); k <= Math.min(w - 1, b + 1); k++) out[row + k] = 255;
    }
  }
  for (const r of hRules) {
    const cy = Math.round(r.y);
    for (let x = Math.max(0, Math.floor(r.x0)); x <= Math.min(w - 1, Math.ceil(r.x1)); x++) {
      let y = -1;
      for (let d = 0; d <= reach && y < 0; d++) {
        if (cy - d >= 0 && ink((cy - d) * w + x)) y = cy - d;
        else if (cy + d < h && ink((cy + d) * w + x)) y = cy + d;
      }
      if (y < 0) continue;
      let a = y, b = y;
      while (a > 0 && ink((a - 1) * w + x)) a--;
      while (b < h - 1 && ink((b + 1) * w + x)) b++;
      if (b - a + 1 <= maxThick) for (let k = Math.max(0, a - 1); k <= Math.min(h - 1, b + 1); k++) out[k * w + x] = 255;
    }
  }
  return out;
}
