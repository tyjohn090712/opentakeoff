// Linear-run points, LiveCount-style (electrical fork).
//
// While a linear run is traced, every click is a COUNTED point unless Shift is
// held (an uncounted bend). G drops a DISCONNECTED point: the next click starts
// a new segment and the jump between them is not measured. Space adds an ADDER
// at the last point: extra length (a drop, a makeup) at the item's adder
// length, changeable per item.
//
// The draft keeps one meta entry per clicked point, parallel to the canvas's
// `poly` / `polyCurve` arrays:
//   { u: true }    uncounted (Shift-click); absent = counted
//   { gap: true }  the segment INTO this point is a jump (G), not run length
//   { add: [ft] }  adders dropped at this point (Space), in feet
// Arc bow points (curve mode) are never counted: they shape the line, they are
// not a place on it.
//
// A committed linear shape carries the result as `run`:
//   run = { n, counted: [{ i, at }], adders: [{ i, at, ft }], group? }
// `n` is the vertex count at commit, `i` a vertex index, `at` the normalized
// [x, y] where it was placed. While the shape still has n vertices (moves and
// vertex drags) a mark sits on vertex i; once points are inserted or deleted
// it falls back to the nearest vertex to `at`. The QUANTITIES never depend on
// that placement: a run reports counted.length EA and the sum of its adders in
// LF, however its geometry is later edited. `group` ties the pieces of one
// disconnected run together.

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Points counted on a committed linear shape (0 for any other shape or a run without points). */
export function runCountedPoints(s) {
  if (s?.measure_role !== "linear") return 0;
  return Array.isArray(s.run?.counted) ? s.run.counted.length : 0;
}

/** Feet of adders on a committed linear shape. */
export function runAdderLf(s) {
  if (s?.measure_role !== "linear" || !Array.isArray(s.run?.adders)) return 0;
  return s.run.adders.reduce((n, a) => n + (isNum(a?.ft) && a.ft > 0 ? a.ft : 0), 0);
}

/** Traced length plus adders — what a linear shape contributes to its condition's LF. */
export function runTotalLf(s) {
  return (Number(s?.computed?.perimeter_lf) || 0) + runAdderLf(s);
}

/** Length of a draft in px, skipping the jumps G made. `meta` may be shorter than pts. */
export function draftRunLength(pts, meta = []) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    if (meta[i]?.gap) continue;
    L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return L;
}

/** Counted points and adder feet in a draft (bow points never count). */
export function draftRunTally(meta = [], curve = []) {
  let counted = 0, adderFt = 0;
  meta.forEach((m, i) => {
    if (!curve[i] && !m?.u) counted++;
    for (const ft of m?.add || []) if (isNum(ft) && ft > 0) adderFt += ft;
  });
  return { counted, adderFt };
}

/**
 * Merge back-to-back clicks on the same spot (the double-click that finishes a
 * run lands two points there) so the end of a run is never counted twice. The
 * first click's counted/uncounted state wins; adders on both are kept.
 */
export function dedupeDraft(pts, curve = [], meta = [], eps = 0.5) {
  const out = { pts: [], curve: [], meta: [] };
  pts.forEach((p, i) => {
    const k = out.pts.length - 1;
    const m = meta[i] || {};
    if (k >= 0 && !m.gap && !curve[i] && !out.curve[k] && Math.hypot(p[0] - out.pts[k][0], p[1] - out.pts[k][1]) <= eps) {
      const add = [...(out.meta[k].add || []), ...(m.add || [])];
      out.meta[k] = { ...out.meta[k], ...(add.length ? { add } : {}) };
      return;
    }
    out.pts.push(p); out.curve.push(!!curve[i]); out.meta.push(m);
  });
  return out;
}

/**
 * Split a draft at its jumps. Returns pieces of { pts, curve, meta } that each
 * start at a jump (or the first point). A piece never starts on a bow point:
 * the canvas places the point after a jump as a corner.
 */
export function splitDraftRun(pts, curve = [], meta = []) {
  const pieces = [];
  let cur = null;
  pts.forEach((p, i) => {
    if (!cur || meta[i]?.gap) { cur = { pts: [], curve: [], meta: [] }; pieces.push(cur); }
    cur.pts.push(p); cur.curve.push(!!curve[i]); cur.meta.push(meta[i] || {});
  });
  return pieces;
}

// index of `p` in `arr` (exact first, then within eps) — maps a clicked corner
// to its vertex after a curve is flattened
function indexOfPoint(arr, p, eps = 1e-6) {
  let best = -1, bd = Infinity;
  for (let j = 0; j < arr.length; j++) {
    const d = Math.hypot(arr[j][0] - p[0], arr[j][1] - p[1]);
    if (d < bd) { bd = d; best = j; }
  }
  return bd <= eps ? best : -1;
}

/**
 * Build committed run data for one piece.
 *   piece   { pts, curve, meta } from splitDraftRun (clicked points, px)
 *   drawn   the vertices the shape will store, px (the flattened curve, or pts)
 *   norm    px point → normalized [x, y]
 *   extra   { counted: [px points], adders: [{ at: px, ft }] } carried in from a
 *           piece too short to stand alone; they keep their position, not a vertex
 * Returns the `run` object, or null when the piece carries nothing.
 * @param {{ pts: number[][], curve: boolean[], meta: any[] }} piece
 * @param {number[][]} drawn
 * @param {(p: number[]) => number[]} norm
 * @param {{ counted?: number[][], adders?: { at: number[], ft: number }[] } | null} [extra]
 */
export function buildRun(piece, drawn, norm, extra = null) {
  const counted = [], adders = [];
  piece.pts.forEach((p, k) => {
    if (piece.curve[k]) return;   // a bow point is not a place on the run
    const i = indexOfPoint(drawn, p);
    const m = piece.meta[k] || {};
    if (!m.u) counted.push({ i, at: norm(p) });
    for (const ft of m.add || []) if (isNum(ft) && ft > 0) adders.push({ i, at: norm(p), ft });
  });
  for (const p of extra?.counted || []) counted.push({ i: -1, at: norm(p) });
  for (const a of extra?.adders || []) adders.push({ i: -1, at: norm(a.at), ft: a.ft });
  if (!counted.length && !adders.length) return null;
  return { n: drawn.length, counted, adders };
}

/** What a piece too short to be a run (one point) still carries: its counted point and adders. */
export function strandedMarks(piece) {
  const counted = [], adders = [];
  piece.pts.forEach((p, k) => {
    if (piece.curve[k]) return;
    const m = piece.meta[k] || {};
    if (!m.u) counted.push(p);
    for (const ft of m.add || []) if (isNum(ft) && ft > 0) adders.push({ at: p, ft });
  });
  return { counted, adders };
}

/**
 * Where to draw a committed run's marks, in normalized coordinates:
 * on vertex i while the vertex count is unchanged, else the nearest vertex to
 * `at` (a point with i = -1 stays at `at`). Returns { counted: [[x,y]], adders: [{ at:[x,y], ft }] }.
 */
export function runMarkPositions(s) {
  const verts = s?.verts_norm || [];
  const run = s?.run;
  if (!run || !verts.length) return { counted: [], adders: [] };
  const same = run.n === verts.length;
  const place = (m) => {
    if (!Array.isArray(m?.at)) return null;
    if (!isNum(m.i) || m.i < 0) return m.at;
    if (same && verts[m.i]) return verts[m.i];
    let best = verts[0], bd = Infinity;
    for (const v of verts) { const d = Math.hypot(v[0] - m.at[0], v[1] - m.at[1]); if (d < bd) { bd = d; best = v; } }
    return best;
  };
  return {
    counted: (run.counted || []).map(place).filter(Boolean),
    adders: (run.adders || []).map((a) => ({ at: place(a), ft: a.ft })).filter((a) => a.at),
  };
}

/** Feet text for an adder tag: 10 → "+10′", 2.5 → "+2.5′". */
export const adderTag = (ft) => `+${Math.round(ft * 100) / 100}′`;

/** The adder length a condition uses for Space (10 ft unless set). */
export const DEFAULT_ADDER_FT = 10;
export const conditionAdderFt = (c) => (isNum(Number(c?.adder_ft)) && Number(c?.adder_ft) > 0 ? Number(c.adder_ft) : DEFAULT_ADDER_FT);
