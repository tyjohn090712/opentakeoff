// Panel-schedule importer (electrical fork, Wave 4). PURE and pdfjs-free on
// purpose — the scheduleParse.ts precedent: it takes positioned text tokens
// (plus, when the caller has them, the x of the table's vertical rules) and
// returns one panelboard: its header ratings and every circuit position, with
// each breaker's trip and pole count. The SAME parser serves both readers —
//   • vector plans: tokens from the page text layer, rules from the vector
//     linework (Revit/AutoCAD exports);
//   • scanned or flattened plans: tokens from on-device OCR, rules found in the
//     pixels (lib/panelRaster.ts + lib/panelOcr.ts).
//
// What it knows about panel schedules, learned from real sets:
//   - TWO-SIDED is the norm: odd circuits down the left, even down the right,
//     phase-load columns in the middle; each side mirrors CKT · DESCRIPTION ·
//     TRIP · POLES (in either order). A one-sided CKT/DESCRIPTION/TRIP/POLES
//     table is read too.
//   - A multi-pole breaker occupies 2–3 circuit numbers on its side. Revit's
//     default writes it on the first row and marks the rest "--"; other
//     templates MERGE the cell, so the text sits centered on the middle row
//     (3-pole) or BETWEEN two rows (2-pole). Both resolve to the same span.
//   - SPARE = a breaker with no load (you still buy it); SPACE / PREPARED SPACE
//     = no breaker (pole positions only). A blank row is a space.
//
// Withheld doctrine (docs/AGENT_GUIDE.md): a row that names a load but whose
// breaker size or pole count can't be read, a multi-pole span that collides
// with another circuit, or a circuit number missing from the run comes back
// kind:"withheld" with a reason — never guessed into the breaker counts. The
// approval dialog shows them; the estimator resolves or leaves them visible.

import type { Rule, HRule } from "./panelRaster.js";

export type Token = { str: string; x: number; y: number; h: number; w?: number };

export type PanelSide = "L" | "R" | "S";
export type CircuitKind = "load" | "spare" | "space" | "withheld";

export type PanelCircuit = {
  side: PanelSide;
  ckts: number[];          // circuit numbers occupied — one per pole (a space: its own number)
  description: string;
  trip: number | null;     // amps
  poles: number | null;
  kind: CircuitKind;
  reason?: string;         // withheld only: why it isn't counted
  y: number;               // region px of the row the text sat on (citation)
};

export type PanelInfo = {
  volts?: string; bus?: string; main?: string; mounting?: string;
  aic?: string; fed_from?: string; location?: string;
};

export type PanelSchedule = {
  name: string;            // "" when no PANEL title was read — the dialog asks for one
  info: PanelInfo;
  circuits: PanelCircuit[];
  positions: number;       // highest circuit number on the schedule
  layout: "two-sided" | "single";
};

export type PanelParse = { panel: PanelSchedule } | { panel: null; reason: string };

export type Role = "ckt" | "desc" | "trip" | "poles";
export type Col = { x0: number; x1: number; role: Role | null; side: PanelSide | null };

// ── normalization ────────────────────────────────────────────────────────────
const up = (s: string) => (s || "").trim().toUpperCase();
const bare = (s: string) => up(s).replace(/[^A-Z0-9#]/g, "");
const tokW = (t: Token) => (t.w && t.w > 0 ? t.w : Math.max(t.h * 0.55 * (t.str || "").trim().length, t.h * 0.5));
const hasAlnum = (s: string) => /[A-Z0-9]/i.test(s || "");

// OCR confusions inside a NUMERIC cell only (CKT / TRIP / POLES): O→0, I/l/|→1.
// Applied only when the result is all digits, so a description is never touched.
function numish(s: string): string {
  const t = (s || "").trim().replace(/[Oo]/g, "0").replace(/[Il|!]/g, "1");
  return t;
}

// Standard ampere ratings for fuses and inverse-time breakers, NEC 240.6(A).
// A trip that isn't one is far more likely a misread ("2O", "0A" for "30A")
// than a real breaker, so it's withheld rather than counted.
export const STANDARD_TRIPS = new Set([
  15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250,
  300, 350, 400, 450, 500, 600, 700, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000, 5000, 6000,
]);

// A trip cell: "20", "20A", "20 A", "125 AMP", or a combined trip/pole "20/1",
// "20A/2P" (some templates have one BKR column). Returns null for a dash, blank,
// or anything that isn't plainly a breaker size.
export function parseTrip(s: string): { trip: number; poles?: number } | null {
  const t = numish(s).toUpperCase().replace(/\s+/g, "");
  let m = t.match(/^(\d{1,4})A?\/([123])P?$/);
  if (m) return { trip: Number(m[1]), poles: Number(m[2]) };
  m = t.match(/^(\d{1,4})(?:A|AMP|AMPS)?$/);
  if (m && Number(m[1]) > 0) return { trip: Number(m[1]) };
  return null;
}
export function parsePoles(s: string): number | null {
  const m = numish(s).toUpperCase().replace(/\s+/g, "").match(/^([123])P?$/);
  return m ? Number(m[1]) : null;
}
// Circuit-number cell → its integers ("7", "1,3,5" in a merged cell). Ignores
// anything with letters so a description that drifted into the column can't
// mint a circuit.
function parseCkts(s: string): number[] {
  const t = numish(s).replace(/\s+/g, " ").trim();
  if (!t || /[A-Z]/i.test(t)) return [];
  const nums = t.split(/[ ,;/&]+/).filter(Boolean);
  if (!nums.every((n) => /^\d{1,3}$/.test(n))) return [];
  return nums.map(Number).filter((n) => n > 0 && n < 1000);
}
const isSpaceLabel = (d: string) => /\bSPACE\b/.test(up(d)) && !/\bSPARE\b/.test(up(d));
const isSpareLabel = (d: string) => /\bSPARE\b/.test(up(d));

// ── header vocabulary ───────────────────────────────────────────────────────
// SPECIFIC words name one column; GENERIC ones ("CB", "BKR") are group headers
// that span TRIP + POLES in some templates — they only count when nothing
// specific claims the column.
const SPECIFIC: Record<string, Role> = {
  CKT: "ckt", CCT: "ckt", CIR: "ckt", CIRC: "ckt", CKTS: "ckt", CCTS: "ckt", "CKT#": "ckt", "CCT#": "ckt", "#": "ckt", CKTNO: "ckt", CCTNO: "ckt", NO: "ckt", NUM: "ckt", NUMBER: "ckt",
  DESCRIPTION: "desc", DESCRIPTIONS: "desc", DESC: "desc", DESCR: "desc", SERVES: "desc", SERVED: "desc", SERVING: "desc", LOADNAME: "desc",
  TRIP: "trip", AMP: "trip", AMPS: "trip", AMPERE: "trip", AMPERES: "trip", TRIPA: "trip",
  POLES: "poles", POLE: "poles", P: "poles", PL: "poles", NP: "poles", "#P": "poles",
};
const GENERIC: Record<string, Role> = { CB: "trip", BKR: "trip", BREAKER: "trip", OCPD: "trip" };
// A header token is a word (OCR) or a whole cell ("CIRCUIT DESCRIPTION", "CCT
// NO." — a PDF text layer usually carries one item per cell): the cell's role
// is its first word that names one. "DESCRIP" / "DESCRIPT": OCR splits or
// truncates the longest header word.
const wordRole = (w: string): Role | null => SPECIFIC[bare(w)] ?? (/^DESC/.test(bare(w)) ? "desc" : null);
const roleOf = (s: string): Role | null => {
  const whole = wordRole(s);
  if (whole) return whole;
  for (const w of (s || "").split(/\s+/)) { const r = wordRole(w); if (r) return r; }
  return null;
};
const genericOf = (s: string): Role | null => {
  const words = (s || "").split(/\s+/).filter(Boolean);
  return words.length === 1 ? GENERIC[bare(words[0])] ?? null : null;
};
// a word that only ever appears in a header row (used to grow the header band)
const HEADER_OTHER = /^(A|B|C|NO|NOTE|NOTES|TYPE|TOTAL|KVA|VA|LOAD|LOADKVA|PHASE|PH|WIRE|CONDUIT|LCL|CIRCUIT|KW|REMARKS|CB|BKR|OCP|SIZE|OPTIONS|OPTION)$/;

// ── geometry helpers ────────────────────────────────────────────────────────
// Cluster tokens into visual rows by y (the scheduleParse.ts rule: the running
// average, tolerance scaled to text height so it holds at any raster).
function clusterRows(tokens: Token[]): Token[][] {
  const toks = [...tokens].filter((t) => t.str && t.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Token[][] = [];
  let cur: Token[] = [];
  let cy = 0;
  for (const t of toks) {
    const tol = Math.max(t.h * 0.6, 3);
    if (cur.length && Math.abs(t.y - cy) > tol) { rows.push(cur); cur = []; }
    cur.push(t);
    cy = cur.reduce((s, w) => s + w.y, 0) / cur.length;
  }
  if (cur.length) rows.push(cur);
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}
const rowY = (r: Token[]) => r.reduce((s, t) => s + t.y, 0) / r.length;
const rowH = (r: Token[]) => r.reduce((s, t) => s + t.h, 0) / r.length;
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
};

// The header band: the row naming the most distinct roles (needs ≥3 of
// ckt/desc/trip/poles), grown by adjacent rows that are header-ish too ("NO."
// under "CCT", a "CB" group header over AMP/P). Returns row indices.
function findHeaderBand(rows: Token[][]): { top: number; bottom: number; best: number } | null {
  // OCR routinely drops one-character headers ("P", "#"), so DESCRIPTION +
  // TRIP alone qualify; the missing columns are then found from the rules
  let best = -1, bestN = 0;
  rows.forEach((r, i) => {
    const roles = new Set(r.map((t) => roleOf(t.str)).filter(Boolean));
    const n = roles.size >= 3 || (roles.has("desc") && (roles.has("trip") || roles.has("ckt"))) ? roles.size : 0;
    if (n > bestN) { best = i; bestN = n; }
  });
  if (best < 0 || bestN < 2) return null;
  const headerish = (r: Token[]) => r.length > 0 && r.every((t) => roleOf(t.str) || genericOf(t.str) || HEADER_OTHER.test(bare(t.str)) || /^[A-Z]{3,}$/.test(bare(t.str)) && !/\d/.test(t.str));
  const near = (i: number, j: number) => Math.abs(rowY(rows[i]) - rowY(rows[j])) < 2.6 * Math.max(rowH(rows[i]), rowH(rows[j]));
  let top = best, bottom = best;
  while (top > 0 && near(top - 1, top) && headerish(rows[top - 1]) && rows[top - 1].some((t) => roleOf(t.str) || genericOf(t.str) || HEADER_OTHER.test(bare(t.str)))) top--;
  while (bottom < rows.length - 1 && near(bottom, bottom + 1) && headerish(rows[bottom + 1]) && rows[bottom + 1].some((t) => roleOf(t.str) || HEADER_OTHER.test(bare(t.str)))) bottom++;
  return { top, bottom, best };
}

// Columns from the table's own vertical rules — the reliable source: a cell's
// text always starts inside its rules, so assigning by left edge never bleeds
// a left-aligned description into the next column (the failure mode of
// header-midpoint banding on a wide, centered DESCRIPTION header).
function colsFromRules(rules: Rule[], hdrY: number, hdrH: number): Col[] {
  // only rules that cross the circuit table's header row bound its columns
  const xs = [...new Set(rules
    .filter((r) => r.y0 <= hdrY - 0.8 * hdrH && r.y1 >= hdrY + 2.5 * hdrH)
    .map((r) => Math.round(r.x * 10) / 10))].sort((a, b) => a - b);
  const cols: Col[] = [];
  for (let i = 0; i + 1 < xs.length; i++) if (xs[i + 1] - xs[i] > 2) cols.push({ x0: xs[i], x1: xs[i + 1], role: null, side: null });
  return cols;
}

// Fallback when no rules are available: one column per header cell, bounded
// at the midpoint between neighbours — except a DESCRIPTION column, whose
// bounds push out to the neighbour's own header edge (its text is
// left-aligned under a centered header, so a midpoint would cut it).
function colsFromHeader(band: Token[]): Col[] {
  const toks = [...band].sort((a, b) => a.x - b.x);
  // one cell per header column: words stacked in x ("CCT" over "NO.") or a
  // phrase ("LOAD DESCRIPTION", "CIRCUIT DESCRIPTION") merge into one
  const cells: { x0: number; x1: number; words: Token[] }[] = [];
  for (const t of toks) {
    const last = cells[cells.length - 1];
    const x1 = t.x + tokW(t);
    const overlaps = last && t.x <= last.x1 + 0.2 * t.h;
    const phrase = last && t.x - last.x1 < 0.9 * t.h && /DESC|SERV|NAME/.test(bare(t.str)) && /^(LOAD|CIRCUIT|CKT|EQUIPMENT)$/.test(bare(last.words[last.words.length - 1].str));
    if (last && (overlaps || phrase)) { last.words.push(t); last.x1 = Math.max(last.x1, x1); }
    else cells.push({ x0: t.x, x1, words: [t] });
  }
  const cols: Col[] = cells.map((c) => ({ x0: c.x0, x1: c.x1, role: null, side: null }));
  const roleCell = (i: number): Role | null => {
    for (const w of cells[i].words) { const r = roleOf(w.str); if (r) return r; }
    return null;
  };
  const out: Col[] = [];
  for (let i = 0; i < cols.length; i++) {
    const isDesc = roleCell(i) === "desc";
    const prev = cols[i - 1], next = cols[i + 1];
    const prevDesc = i > 0 && roleCell(i - 1) === "desc";
    const nextDesc = i + 1 < cols.length && roleCell(i + 1) === "desc";
    const h = cells[i].words[0].h;
    let x0 = prev ? (isDesc ? prev.x1 + 0.3 * h : prevDesc ? cols[i].x0 - 0.6 * h : (prev.x1 + cols[i].x0) / 2) : -Infinity;
    let x1 = next ? (isDesc ? next.x0 - 0.3 * h : nextDesc ? cols[i].x1 + 0.6 * h : (cols[i].x1 + next.x0) / 2) : Infinity;
    if (x1 < x0) [x0, x1] = [x1, x0];
    out.push({ x0, x1, role: null, side: null });
  }
  return out;
}

const colIndexAt = (cols: Col[], x: number) => {
  for (let i = 0; i < cols.length; i++) if (x >= cols[i].x0 && x < cols[i].x1) return i;
  return -1;
};
// a token's probe point: just inside its left edge (text starts inside a cell)
const probeX = (t: Token) => t.x + Math.min(tokW(t), t.h) * 0.3;

// ── label/value header fields (VOLTS, BUS AMPS, MAIN, …) ────────────────────
const INFO_LABELS: [keyof PanelInfo, RegExp][] = [
  ["volts", /^(VOLTS?|VOLTAGE|SYSTEMVOLTAGE)$/],
  ["bus", /^(BUSAMPS|BUSRATING|BUS|BUSSING|BUSAMPACITY|RATING)$/],
  ["main", /^(MAINOCPD|MAINCB|MAINBKR|MAINBREAKER|MAIN|MAINS|MAINTYPE|MAINSTYPE|MCB|MLO)$/],
  ["mounting", /^(MOUNTING|MOUNT|MTG)$/],
  ["aic", /^(AIC|KAIC|SCCR|AICRATING|INTERRUPTINGRATING|FAULTDUTY|FAULTCURRENT|SHORTCIRCUITRATING)$/],
  ["fed_from", /^(FEDFROM|FEEDFROM|FED|SUPPLYFROM|SOURCE)$/],
  ["location", /^(LOCATION|LOC)$/],
];
const ALL_LABEL_WORDS = /^(VOLTS?|VOLTAGE|BUS|AMPS|MAIN|MAINS|OCPD|CB|MOUNTING|MOUNT|AIC|KAIC|SCCR|FED|FROM|FEED|LOCATION|LOC|SPD|LUGS|PHASE|WIRE|NEUTRAL|TYPE|NEMA|ENCLOSURE|FEEDS?|FAULT|DUTY|DESIGNATION|BRANCH|OPTIONS|GROUND|INTEGRAL|ACCESSORIES|OWNER|METERS)$/;

function readInfo(rows: Token[][]): PanelInfo {
  const info: PanelInfo = {};
  for (const r of rows) {
    for (let i = 0; i < r.length; i++) {
      // a label is a run of 1–3 tokens; prefer the longest that matches
      for (let n = 3; n >= 1; n--) {
        if (i + n > r.length) continue;
        const run = r.slice(i, i + n);
        if (n > 1 && !run.slice(0, -1).every((t) => !/:$/.test(t.str.trim()))) continue;
        const key = run.map((t) => bare(t.str)).join("");
        const hit = INFO_LABELS.find(([, re]) => re.test(key));
        if (!hit || info[hit[0]]) continue;
        // value: following tokens until the next label word / colon-label or a wide gap
        const vals: string[] = [];
        let lastX = run[run.length - 1].x + tokW(run[run.length - 1]);
        for (let j = i + n; j < r.length; j++) {
          const t = r[j];
          if (/:$/.test(t.str.trim()) || (ALL_LABEL_WORDS.test(bare(t.str)) && vals.length)) break;
          if (t.x - lastX > 6 * t.h && vals.length) break;
          vals.push(t.str.trim());
          lastX = t.x + tokW(t);
        }
        const v = vals.join(" ").replace(/\s+/g, " ").trim();
        if (v && hasAlnum(v)) info[hit[0]] = v.slice(0, 60);
        i += n - 1;
        break;
      }
    }
  }
  return info;
}

// words that follow "PANEL" in a banner or a label, never a panel's name
const NOT_A_NAME = /^(SCHEDULES?|SCHED|BOARDS?|NAME|TYPE|DATA|DESIGNATION|INFO|RATINGS?|NOTES?)\b/i;

// "PANEL: LP-1" / "Panel: E" / "PANELBOARD LP1A" / "DESIGNATION: SITE1-ROOM2-PNL02"
// — the token nearest above the header band wins (a sheet title "PANEL
// SCHEDULES" further up never does: "SCHEDULES" isn't a name, and it's farther
// away).
const NAME_VAL = /^[A-Z0-9][A-Z0-9\-./]{0,39}$/i;
function readName(rows: Token[][]): string {
  for (let ri = rows.length - 1; ri >= 0; ri--) {
    const r = rows[ri];
    for (let i = 0; i < r.length; i++) {
      const s = r[i].str.trim();
      const inline = s.match(/^PANEL(?:BOARD)?(?:\s*NAME)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-./]{0,39})$/i);
      if (inline && /^PANEL/i.test(s) && !/^PANEL(BOARD)?:?$/i.test(s) && !NOT_A_NAME.test(inline[1])) return clean(inline[1]);
      const lab = /^PANEL(BOARD)?(NAME)?:?$/i.test(bare(s)) || /^PANEL(BOARD)?:?$/i.test(s) || /^DESIGNATION:?$/i.test(s);
      if (lab) {
        let j = i + 1;
        if (j < r.length && /^NAME:?$/i.test(r[j].str.trim())) j++;
        const nxt = r[j]?.str.trim().replace(/^:/, "").trim();
        if (nxt && NAME_VAL.test(nxt) && !NOT_A_NAME.test(nxt) && !ALL_LABEL_WORDS.test(bare(nxt))) return clean(nxt);
      }
    }
  }
  return "";
  function clean(s: string) { return up(s).replace(/[.:]+$/, ""); }
}

// ── the parse ───────────────────────────────────────────────────────────────
type Item = {
  y: number; ckt: number | null;
  trip: number | null; poles: number | null; desc: string;
  marker: boolean;        // only dashes/ditto in the role cells — a continuation row
  hasTripCell: boolean; hasPolesCell: boolean;
};

export type PanelLayout = {
  rows: Token[][];
  band: { top: number; bottom: number; best: number };
  header: { y: number; h: number; bottom: number };   // main header row baseline/height; band's last baseline
  cols: Col[];
  sides: PanelSide[];
  twoSided: boolean;
  pick: Record<PanelSide, Partial<Record<Role, number>>>;   // side → role → column index
};

/**
 * Locate the circuit table: header band, columns (from `rules` when given —
 * the reliable path — else from the header words), each column's role, and
 * the two sides. Shared by the parser and the OCR reader (which uses it to
 * decide which column strips to read). Returns { error } instead of guessing.
 */
export function panelLayout(tokens: Token[], opts: { rules?: Rule[] } = {}): PanelLayout | { error: string } {
  const rows = clusterRows(tokens);
  const band = findHeaderBand(rows);
  if (!band) return { error: "no circuit table header (CKT / DESCRIPTION / TRIP / POLES) found" };
  const bandToks = rows.slice(band.top, band.bottom + 1).flat();
  const hdrY = rowY(rows[band.best]), hdrH = rowH(rows[band.best]);
  const dataToks = rows.slice(band.bottom + 1).flat();

  // columns: rules first, header-derived as the fallback
  let cols = opts.rules && opts.rules.length >= 4 ? colsFromRules(opts.rules, hdrY, hdrH) : [];
  const fromRules = cols.length >= 3;
  if (!fromRules) cols = colsFromHeader(bandToks.filter((t) => roleOf(t.str) || genericOf(t.str) || HEADER_OTHER.test(bare(t.str)) || /DESC|SERV|NAME/.test(bare(t.str))));

  // label each column from the header words inside it: specific words vote;
  // a generic group header ("CB" over AMP + P) is remembered separately and
  // only used where nothing else names the column. `other` marks columns a
  // non-circuit header claims (A/B/C, NOTE, TYPE, TOTAL…) so no fallback below
  // can mistake them for a missed POLES column.
  const votes = cols.map(() => new Map<Role, number>());
  const generic = cols.map(() => null as Role | null);
  const other = cols.map(() => false);
  for (const t of bandToks) {
    const ci = colIndexAt(cols, t.x + tokW(t) / 2);
    if (ci < 0) continue;
    const r = roleOf(t.str);
    if (r) votes[ci].set(r, (votes[ci].get(r) || 0) + 1);
    else if (genericOf(t.str)) generic[ci] = genericOf(t.str);
    else if (HEADER_OTHER.test(bare(t.str)) && !/^(CB|BKR|LOAD|CIRCUIT|NO)$/.test(bare(t.str))) other[ci] = true;
  }
  // Stacked or split header words only mean something together: a column whose
  // header reads "OCP SIZE" holds the breaker size, while "CIRCUIT SIZE" (the
  // wire) and "OCP OPTIONS" are not it. So the column's words are joined top to
  // bottom and the phrase votes.
  cols.forEach((_, i) => {
    const words = bandToks.filter((t) => colIndexAt(cols, t.x + tokW(t) / 2) === i).sort((a, b) => a.y - b.y || a.x - b.x).map((t) => t.str).join(" ");
    if (/\bOCP\s*SIZE\b|\bBREAKER\s*SIZE\b|\bBKR\s*SIZE\b/i.test(words)) votes[i].set("trip", (votes[i].get("trip") || 0) + 2);
    else if (/\bCIRCUIT\s*SIZE\b|\bWIRE\s*SIZE\b|\bCONDUCTOR/i.test(words)) other[i] = true;
  });
  const PRI: Role[] = ["ckt", "poles", "trip", "desc"];
  cols.forEach((c, i) => {
    let best: Role | null = null, bn = 0;
    for (const r of PRI) { const n = votes[i].get(r) || 0; if (n > bn) { best = r; bn = n; } }
    c.role = best;
  });
  const intsIn = (i: number) => dataToks.filter((t) => colIndexAt(cols, probeX(t)) === i)
    .map((t) => ({ y: t.y, n: parseCkts(t.str) })).filter((v) => v.n.length === 1)
    .sort((a, b) => a.y - b.y).map((v) => v.n[0]);

  // A lone "#" over the circuit numbers is the header OCR most often drops.
  // With real column rules, recognize the column by its data instead: integers
  // stepping by 1 or 2 down the rows; failing that, the table's outermost
  // narrow columns (every panel template seen puts circuit numbers at the
  // edges). The outermost candidates win either way.
  if (fromRules && !cols.some((c) => c.role === "ckt")) {
    const seqCols: number[] = [];
    cols.forEach((c, i) => {
      if (c.role || other[i]) return;
      const ints = intsIn(i);
      let steps = 0;
      for (let k = 1; k < ints.length; k++) if (ints[k] - ints[k - 1] === 1 || ints[k] - ints[k - 1] === 2) steps++;
      if (ints.length >= 4 && steps >= Math.max(3, (ints.length - 1) * 0.6)) seqCols.push(i);
    });
    const tableW = cols[cols.length - 1].x1 - cols[0].x0;
    const narrow = (i: number) => cols[i].x1 - cols[i].x0 < 0.06 * tableW && !cols[i].role && !other[i];
    // two DESCRIPTION columns ⇒ a two-sided table: both edges carry numbers,
    // even when only one edge's numbers survived the sparse read
    const twoDesc = cols.filter((c) => c.role === "desc").length >= 2;
    if (!seqCols.length || (twoDesc && seqCols.length === 1)) {
      for (const i of [0, cols.length - 1]) if (!seqCols.includes(i) && narrow(i)) seqCols.push(i);
      seqCols.sort((a, b) => a - b);
    }
    if (seqCols.length) {
      cols[seqCols[0]].role = "ckt";
      if (seqCols.length > 1) cols[seqCols[seqCols.length - 1]].role = "ckt";
    }
  }

  // sides: two CKT columns ⇒ two-sided (split between them); one ⇒ single
  const cktCols = cols.map((c, i) => (c.role === "ckt" ? i : -1)).filter((i) => i >= 0);
  if (!cktCols.length) return { error: "no circuit-number column found" };
  const twoSided = cktCols.length >= 2;
  const iL = cktCols[0], iR = cktCols[cktCols.length - 1];
  const split = twoSided ? ((cols[iL].x0 + cols[iL].x1) / 2 + (cols[iR].x0 + cols[iR].x1) / 2) / 2 : Infinity;
  cols.forEach((c) => { c.side = twoSided ? ((c.x0 + c.x1) / 2 < split ? "L" : "R") : "S"; });
  const sides: PanelSide[] = twoSided ? ["L", "R"] : ["S"];
  // a generic "CB"/"BKR" names TRIP only on a side with no specific TRIP column
  cols.forEach((c, i) => {
    if (c.role || !generic[i]) return;
    if (!cols.some((o) => o.role === generic[i] && o.side === c.side)) c.role = generic[i];
  });

  // per side, the role column nearest that side's CKT column; with rules, a
  // role the OCR/header missed on one side is recovered by mirroring the other
  // side's column index around the table's axis
  const pick: Record<PanelSide, Partial<Record<Role, number>>> = { L: {}, R: {}, S: {} };
  for (const s of sides) {
    const ck = s === "R" ? iR : iL;
    pick[s].ckt = ck;
    for (const role of ["desc", "trip", "poles"] as Role[]) {
      let best = -1, bd = Infinity;
      cols.forEach((c, i) => { if (c.role === role && c.side === s && Math.abs(i - ck) < bd) { best = i; bd = Math.abs(i - ck); } });
      if (best >= 0) pick[s][role] = best;
    }
  }
  const taken = (i: number) => sides.some((s) => Object.values(pick[s]).includes(i));
  if (twoSided && fromRules) {
    for (const [a, b] of [["L", "R"], ["R", "L"]] as [PanelSide, PanelSide][]) {
      for (const role of ["desc", "trip", "poles"] as Role[]) {
        const src = pick[a][role];
        if (pick[b][role] === undefined && src !== undefined) {
          const m = iL + iR - src;
          if (m >= 0 && m < cols.length && !cols[m].role && !other[m] && !taken(m)) pick[b][role] = m;
        }
      }
    }
  }
  // POLES with no header ("P" dropped on both sides): the unlabeled, narrow
  // column right beside TRIP — preferring one whose values are all 1–3
  if (fromRules) {
    for (const s of sides) {
      const t = pick[s].trip;
      if (pick[s].poles !== undefined || t === undefined) continue;
      const cands = [t - 1, t + 1].filter((i) => i >= 0 && i < cols.length && !cols[i].role && !other[i] && !taken(i) && cols[i].side === cols[t].side
        && cols[i].x1 - cols[i].x0 < 2.2 * (cols[t].x1 - cols[t].x0));
      const ones = (i: number) => intsIn(i).filter((n) => n >= 1 && n <= 3).length;
      cands.sort((a, b) => ones(b) - ones(a));
      if (cands.length) pick[s].poles = cands[0];
    }
  }
  for (const s of sides) if (pick[s].trip === undefined || pick[s].desc === undefined) {
    return { error: `couldn't find the ${pick[s].trip === undefined ? "TRIP / AMP" : "DESCRIPTION"} column${twoSided ? (s === "L" ? " on the left side" : " on the right side") : ""}` };
  }
  return { rows, band, header: { y: hdrY, h: hdrH, bottom: rowY(rows[band.bottom]) }, cols, sides, twoSided, pick };
}

/** Which column a token falls in (its probe point just inside its left edge). */
export const columnOf = (cols: Col[], t: Token) => colIndexAt(cols, probeX(t));

/**
 * Parse one panel schedule from tokens inside the marqueed region.
 * `rules` — the table's vertical rules in the same px space (vector linework
 * or panelRaster.findVerticalRules); optional, but the reliable path.
 * `hrules` — its horizontal rules; only needed for schedules with no POLES
 * column, where a breaker's pole count IS the height of its merged cell.
 * Returns { panel: null, reason } rather than inventing a panel.
 */
export function parsePanelSchedule(tokens: Token[], opts: { rules?: Rule[]; hrules?: HRule[] } = {}): PanelParse {
  const lay = panelLayout(tokens, opts);
  if ("error" in lay) return { panel: null, reason: lay.error };
  const { rows, band, cols, sides, twoSided, pick } = lay;
  // A POLES column that never holds a 1, 2 or 3 is not a POLES column: a wire-
  // size column full of dashes was taken for one, on a scan that dropped its
  // header words. Without it the pole count falls back to the merged cell's
  // height, as on every schedule that has no such column.
  {
    const body = rows.slice(band.bottom + 1);
    for (const sd of sides) {
      const pc = pick[sd].poles;
      if (pc === undefined) continue;
      const cells = body.map((r) => r.filter((t) => colIndexAt(cols, probeX(t)) === pc).map((t) => t.str.trim()).join(" ")).filter(Boolean);
      if (cells.length >= 3 && !cells.some((c) => parsePoles(c) !== null || parseTrip(c)?.poles !== undefined)) delete pick[sd].poles;
    }
  }

  // ── data rows ──
  // The table ends where its circuit numbers end. Rows below the last number
  // (totals, the load summary, notes) are never circuits — content up to ~a
  // row past it is kept (a last number the reader dropped, a merged cell's
  // text), and a row that OPENS with TOTAL / NOTES / SUMMARY… ends it there.
  // Deciding by position, not by words, keeps "DEMAND CONTROL" or "TOTAL
  // STATION" in a description from cutting the table short.
  const STOP = /^(TOTAL|TOTALS|SUMMARY|NOTES?|LOAD\s*SUMMARY|CONNECTED|DEMAND)\b/i;
  const cellText = (r: Token[], ci: number | undefined) =>
    ci === undefined ? "" : r.filter((t) => colIndexAt(cols, probeX(t)) === ci).map((t) => t.str.trim()).join(" ").trim();
  const items: Record<PanelSide, Item[]> = { L: [], R: [], S: [] };
  const ckRows: Record<PanelSide, { ckt: number; y: number }[]> = { L: [], R: [], S: [] };
  const cktYs: number[] = [];
  for (let ri = band.bottom + 1; ri < rows.length; ri++) {
    if (sides.some((s) => parseCkts(cellText(rows[ri], pick[s].ckt)).length)) cktYs.push(rowY(rows[ri]));
  }
  const gaps = cktYs.slice(1).map((y, i) => y - cktYs[i]).filter((d) => d > 0.3 * lay.header.h);
  const lastCktY = cktYs.length ? cktYs[cktYs.length - 1] : -Infinity;
  const tableEnd = lastCktY + 1.25 * (median(gaps) || 2 * lay.header.h);
  let lastDataRow = band.bottom;
  for (let ri = band.bottom + 1; ri < rows.length; ri++) {
    const r = rows[ri];
    const y = rowY(r);
    if (y > tableEnd) break;
    const perSide = sides.map((s) => ({ s, ckts: parseCkts(cellText(r, pick[s].ckt)) }));
    const anyCkt = perSide.some((p) => p.ckts.length);
    if (!anyCkt && y > lastCktY && STOP.test((r[0]?.str || "").trim())) break;
    let any = false;
    for (const { s, ckts } of perSide) {
      ckts.forEach((c) => ckRows[s].push({ ckt: c, y }));
      const tripS = cellText(r, pick[s].trip), polesS = cellText(r, pick[s].poles), desc = cellText(r, pick[s].desc);
      const content = [tripS, polesS, desc].some((v) => v);
      if (!content) continue;
      any = true;
      const tp = parseTrip(tripS);
      const marker = ![tripS, polesS, desc].some(hasAlnum);
      items[s].push({
        y, ckt: ckts.length ? ckts[0] : null,
        trip: tp ? tp.trip : null,
        poles: tp?.poles ?? parsePoles(polesS),
        desc: hasAlnum(desc) ? desc.replace(/\s+/g, " ") : "",
        marker,
        hasTripCell: hasAlnum(tripS), hasPolesCell: hasAlnum(polesS),
      });
    }
    if (anyCkt || any) lastDataRow = ri;
  }

  // ── per side: the circuit-number grid ──
  // Circuit numbers are an arithmetic run down each side (1,3,5… / 2,4,6… on a
  // two-sided panel, 1,2,3… on a one-sided one) at the table's row pitch. OCR
  // drops a repeated digit in a narrow column ("11"→"1", "22"→"2", "34"→"4")
  // and a text layer can carry a typo, so each row's number is read off that
  // grid: pitch from the row spacing, base from the MAJORITY of what was read.
  // A read number the grid disagrees with is corrected; a row with content but
  // no number gets its number; text BETWEEN rows (a merged multi-pole cell)
  // stays floating. Too few numbers to establish a majority → trust the reads.
  const step = twoSided ? 2 : 1;
  const circuits: PanelCircuit[] = [];
  const dys: number[] = [];
  for (const s of sides) {
    const ys = ckRows[s].map((r) => r.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > 0.3 * lay.header.h) dys.push(ys[i] - ys[i - 1]);
  }
  let pitch = median(dys) || 0;
  const gridFor = (rowsRaw: { ckt: number; y: number }[]) => {
    if (rowsRaw.length < 3 || !pitch) return null;
    const y0 = Math.min(...rowsRaw.map((r) => r.y));
    let p = pitch;
    for (let pass = 0; pass < 2; pass++) {
      // refine the pitch on this side's own rows (least squares of y on k)
      const ks = rowsRaw.map((r) => Math.round((r.y - y0) / p));
      const n = ks.length, mk = ks.reduce((a, k) => a + k, 0) / n, my = rowsRaw.reduce((a, r) => a + r.y, 0) / n;
      const num = ks.reduce((a, k, i) => a + (k - mk) * (rowsRaw[i].y - my), 0), den = ks.reduce((a, k) => a + (k - mk) ** 2, 0);
      if (den > 0 && num > 0) p = num / den;
    }
    const counts = new Map<number, number>();
    for (const r of rowsRaw) { const b = r.ckt - step * Math.round((r.y - y0) / p); counts.set(b, (counts.get(b) || 0) + 1); }
    let base = 0, bn = 0;
    for (const [b, n] of counts) if (n > bn) { base = b; bn = n; }
    if (bn < Math.max(2, rowsRaw.length * 0.4)) return null;
    return {
      // ckt for a y on the grid, or null when y sits between rows
      at: (y: number): number | null => {
        const k = Math.round((y - y0) / p);
        if (Math.abs(y - y0 - k * p) > 0.3 * p) return null;
        const c = base + step * k;
        return c > 0 ? c : null;
      },
      yOf: (c: number) => y0 + ((c - base) / step) * p,
      // the side's first circuit: 1 (or 2 on the even side), unless the
      // numbering starts lower in the table than the header's next row
      first: () => {
        let c = ((base % step) + step) % step || step;
        for (let n = 0; n < 500 && y0 + ((c - base) / step) * p < lay.header.bottom + 0.3 * p; n++) c += step;
        return c;
      },
    };
  };

  for (const s of sides) {
    const grid = gridFor(ckRows[s]);
    let rowsS = [...ckRows[s]].sort((a, b) => a.y - b.y);
    if (grid) {
      // every read row and every content row lands on its grid number, and
      // every slot from the side's first circuit to its last read one is a
      // row — a lone "1" the reader dropped is still row 1 (a merged 3-pole
      // cell centered on row 3 needs rows 1 and 5 to exist to land on 1-3-5)
      const byCkt = new Map<number, number>();
      for (const r of rowsS) { const c = grid.at(r.y); if (c !== null && !byCkt.has(c)) byCkt.set(c, r.y); }
      for (const it of items[s]) {
        const c = grid.at(it.y);
        it.ckt = c;
        if (c !== null && !byCkt.has(c)) byCkt.set(c, it.y);
      }
      if (byCkt.size) {
        const last = Math.max(...byCkt.keys());
        for (let c = grid.first(); c <= last; c += step) if (!byCkt.has(c)) byCkt.set(c, grid.yOf(c));
      }
      rowsS = [...byCkt].map(([ckt, y]) => ({ ckt, y })).sort((a, b) => a.y - b.y);
    }
    if (!rowsS.length) continue;
    if (!pitch && rowsS.length > 1) pitch = (rowsS[rowsS.length - 1].y - rowsS[0].y) / (rowsS.length - 1);
    // No POLES column on this side (a common Revit template): a breaker's pole
    // count is how many circuit rows its cell spans — the cell between the
    // horizontal rules that cross the DESCRIPTION column around the item's text.
    // A merged 3-pole cell has no rule inside it; single-pole cells are one row.
    if (pick[s].poles === undefined && opts.hrules && opts.hrules.length) {
      const dc = cols[pick[s].desc as number];
      const cx = Number.isFinite(dc.x0) && Number.isFinite(dc.x1) ? (dc.x0 + dc.x1) / 2 : null;
      if (cx !== null) {
        const ys = opts.hrules.filter((h) => h.x0 <= cx && h.x1 >= cx).map((h) => h.y).sort((a, b) => a - b);
        const uniq = ys.filter((y, i) => i === 0 || y - ys[i - 1] > 1.5);
        for (const it of items[s]) {
          if (it.poles !== null || it.marker) continue;
          const lo = [...uniq].reverse().find((y) => y < it.y - 1), hi = uniq.find((y) => y > it.y + 1);
          if (lo === undefined || hi === undefined) continue;
          const n = rowsS.filter((r) => r.y > lo && r.y < hi).length;
          if (n >= 1 && n <= 3) it.poles = n;
        }
      }
    }
    const idxOf = new Map(rowsS.map((r, i) => [r.ckt, i]));
    const claimed: (string | null)[] = rowsS.map(() => null);   // row → owner tag
    const claimedBy: number[] = rowsS.map(() => -1);              // row → index in `out`
    // A description line with nothing in TRIP or POLES is a fragment: the
    // second line of a wrapped description in a merged multi-pole cell ("EV
    // CHARGER (CONFIRM" / "BREAKER SIZE)"). It joins the breaker that ends up
    // owning its row; only if no breaker does is it a load with no breaker.
    const fragment = (it: Item) => !it.marker && it.trip === null && !it.hasTripCell && !it.hasPolesCell && !!it.desc && !isSpaceLabel(it.desc);
    const markerAt = new Set<number>();
    const ownItemAt = new Map<number, Item>();
    for (const it of items[s]) {
      if (it.ckt === null) continue;
      const i = idxOf.get(it.ckt);
      if (i === undefined) continue;
      if (it.marker) markerAt.add(i);
      else if (!fragment(it)) ownItemAt.set(i, it);
    }
    const free = (i: number, self: number) => i === self || (!ownItemAt.has(i) && claimed[i] === null);
    const out: PanelCircuit[] = [];
    const place = (it: Item, P: number, anchor: number | null): number[] | null => {
      let best: number[] | null = null;
      let bestKey: [number, number, number] | null = null;
      const lo = anchor === null ? 0 : anchor - P + 1, hi = anchor === null ? rowsS.length - P : anchor;
      for (let st = Math.max(0, lo); st <= hi && st + P <= rowsS.length; st++) {
        const win = Array.from({ length: P }, (_, k) => st + k);
        if (!win.every((i) => free(i, anchor ?? -1))) continue;
        // consecutive circuit numbers on this side only (a gap ≠ a span)
        if (!win.every((i, k) => k === 0 || rowsS[i].ckt - rowsS[win[k - 1]].ckt === step)) continue;
        const markers = win.filter((i) => i !== anchor && markerAt.has(i)).length;
        const meanY = win.reduce((a, i) => a + rowsS[i].y, 0) / P;
        const key: [number, number, number] = [-markers, Math.abs(meanY - it.y), st === anchor ? 0 : 1];
        if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] - 0.5 || (Math.abs(key[1] - bestKey[1]) <= 0.5 && key[2] < bestKey[2])))) { best = win; bestKey = key; }
      }
      if (best && anchor === null && pitch && (bestKey as [number, number, number])[1] > 0.75 * pitch) return null;
      return best;
    };
    // anchored items first (certain rows), merged/floating ones after,
    // description fragments last (they attach to whatever claimed their row)
    const solid = items[s].filter((i) => !i.marker && !fragment(i));
    const ordered = [...solid.filter((i) => i.ckt !== null && idxOf.has(i.ckt)), ...solid.filter((i) => i.ckt === null || !idxOf.has(i.ckt))];
    const parts = new Map<number, { y: number; text: string }[]>();   // out index → description lines
    const claim = (win: number[], tag: string) => { win.forEach((i) => { claimed[i] = tag; claimedBy[i] = out.length; }); };
    for (const it of ordered) {
      const anchor = it.ckt !== null && idxOf.has(it.ckt) ? (idxOf.get(it.ckt) as number) : null;
      const base = { side: s, description: it.desc, trip: it.trip, poles: it.poles, y: it.y };
      const own = anchor !== null ? [rowsS[anchor].ckt] : [];
      if (isSpaceLabel(it.desc) && it.trip === null) {
        const P = it.poles && it.poles > 1 ? it.poles : 1;
        const win = P > 1 ? place(it, P, anchor) : anchor !== null ? [anchor] : place(it, 1, null);
        if (!win) { out.push({ ...base, ckts: own, kind: "withheld", reason: "couldn't place this space on a circuit row" }); continue; }
        claim(win, "space");
        out.push({ ...base, trip: null, poles: null, ckts: win.map((i) => rowsS[i].ckt), kind: "space" });
        continue;
      }
      // withheld rows still hold their rows: a 2-pole breaker whose size didn't
      // read must not leave its second row looking like an empty space
      const holdWithheld = (reason: string) => {
        const win = it.poles && it.poles > 1 ? place(it, it.poles, anchor) : null;
        const rowsHeld = win ?? (anchor !== null ? [anchor] : []);
        claim(rowsHeld, "withheld");
        out.push({ ...base, ckts: rowsHeld.length ? rowsHeld.map((i) => rowsS[i].ckt) : own, kind: "withheld", reason });
      };
      if (it.trip === null) {
        // a named load with no readable breaker — or a stray fragment
        holdWithheld(it.hasTripCell ? "breaker size not readable" : "no breaker size on this row");
        continue;
      }
      if (!STANDARD_TRIPS.has(it.trip)) {
        holdWithheld(`${it.trip}A isn't a standard breaker rating — check the reading`);
        continue;
      }
      if (it.poles === null) {
        if (anchor !== null) claim([anchor], "withheld");
        out.push({ ...base, ckts: own, kind: "withheld", reason: "pole count not readable" });
        continue;
      }
      const win = place(it, it.poles, anchor);
      if (!win) {
        if (anchor !== null) claim([anchor], "withheld");
        out.push({ ...base, ckts: own, kind: "withheld", reason: `${it.poles}-pole breaker doesn't fit the open circuit rows here` });
        continue;
      }
      claim(win, "bkr");
      out.push({ ...base, ckts: win.map((i) => rowsS[i].ckt), kind: !it.desc || isSpareLabel(it.desc) ? "spare" : "load" });
    }
    // fragments: join the circuit that owns their row (top-to-bottom order),
    // else stand as a load with no breaker read
    for (const it of items[s].filter(fragment)) {
      const anchor = it.ckt !== null && idxOf.has(it.ckt) ? (idxOf.get(it.ckt) as number) : null;
      // a line between rows belongs to whatever owns the nearest row
      let near = anchor;
      if (near === null && rowsS.length) {
        near = 0;
        rowsS.forEach((rw, i) => { if (Math.abs(rw.y - it.y) < Math.abs(rowsS[near as number].y - it.y)) near = i; });
        if (pitch && Math.abs(rowsS[near].y - it.y) > 0.75 * pitch) near = null;
      }
      const owner = near !== null ? claimedBy[near] : -1;
      if (owner >= 0 && out[owner].kind !== "space") {
        const list = parts.get(owner) ?? [{ y: out[owner].y, text: out[owner].description }];
        list.push({ y: it.y, text: it.desc });
        parts.set(owner, list);
        continue;
      }
      if (anchor !== null) claim([anchor], "withheld");
      out.push({ side: s, description: it.desc, trip: null, poles: null, y: it.y, ckts: anchor !== null ? [rowsS[anchor].ckt] : [], kind: "withheld", reason: "no breaker size on this row" });
    }
    for (const [oi, list] of parts) {
      out[oi].description = list.sort((a, b) => a.y - b.y).map((p) => p.text).filter(Boolean).join(" ");
      if (out[oi].kind === "spare" && out[oi].description && !isSpareLabel(out[oi].description)) out[oi].kind = "load";
    }
    // unclaimed rows: blank or "--" with no breaker above → a space
    rowsS.forEach((rw, i) => {
      if (claimed[i] !== null) return;
      out.push({ side: s, ckts: [rw.ckt], description: "", trip: null, poles: null, kind: "space", y: rw.y });
    });
    // holes in the numbering (a row the reader never saw) are surfaced, not skipped
    const have = new Set(rowsS.map((r) => r.ckt));
    const nums = rowsS.map((r) => r.ckt);
    const first = Math.min(...nums), last = Math.max(...nums);
    for (let c = first; c <= last; c += step) {
      if (!have.has(c)) out.push({ side: s, ckts: [c], description: "", trip: null, poles: null, kind: "withheld", reason: "circuit row not read", y: NaN });
    }
    circuits.push(...out);
  }

  circuits.sort((a, b) => (a.ckts[0] ?? 1e9) - (b.ckts[0] ?? 1e9) || a.y - b.y);
  const allCkts = circuits.flatMap((c) => c.ckts);
  if (!allCkts.length) return { panel: null, reason: "no numbered circuit rows under the header" };

  const above = rows.slice(0, band.top);
  const below = rows.slice(lastDataRow + 1);
  const info = { ...readInfo(below), ...readInfo(above) };
  return {
    panel: {
      name: readName(above),
      info,
      circuits,
      positions: Math.max(...allCkts),
      layout: twoSided ? "two-sided" : "single",
    },
  };
}

// ── roll-ups ────────────────────────────────────────────────────────────────
export type BreakerLine = { poles: number; trip: number; count: number; spares: number };
export type PanelTotals = {
  breakers: BreakerLine[];   // every breaker you buy (loads + spares), by poles then trip
  breakerCount: number;
  spareCount: number;
  loadCount: number;
  spacePositions: number;    // pole positions with no breaker
  withheld: number;
};

export function panelTotals(circuits: PanelCircuit[]): PanelTotals {
  const by = new Map<string, BreakerLine>();
  let spacePositions = 0, withheld = 0, spareCount = 0, loadCount = 0;
  for (const c of circuits) {
    if (c.kind === "space") { spacePositions += Math.max(1, c.ckts.length); continue; }
    if (c.kind === "withheld") { withheld++; continue; }
    if (c.trip === null || c.poles === null) { withheld++; continue; }
    const k = `${c.poles}|${c.trip}`;
    const line = by.get(k) || { poles: c.poles, trip: c.trip, count: 0, spares: 0 };
    line.count++;
    if (c.kind === "spare") { line.spares++; spareCount++; } else loadCount++;
    by.set(k, line);
  }
  const breakers = [...by.values()].sort((a, b) => a.poles - b.poles || a.trip - b.trip);
  return { breakers, breakerCount: spareCount + loadCount, spareCount, loadCount, spacePositions, withheld };
}

/** "20A 1P" — the breaker label the report, dialog and CSV share. */
export const breakerLabel = (trip: number, poles: number) => `${trip}A ${poles}P`;
