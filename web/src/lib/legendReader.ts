// Legend reader (electrical fork): turn a boxed symbol legend into rows —
// the drawn symbol(s), the description beside them, the section they sit in,
// and what kind of thing each row is — so the guided autocount step can build
// the job's item list from the project's own legend.
//
// Input is what the canvas already has for a sheet: positioned text spans
// ({ str, x0, y0, x1, y1 } in image px) and vector segments (flat
// [ax, ay, bx, by, …] in the same px). Pure and deterministic; tested on
// synthetic legends (test/legendReader.test.ts) — real legend pages are
// confidential and never enter the repo.
//
// What a legend row looks like on real sheets: a SYMBOL | DESCRIPTION table,
// sections headed in larger or underlined text (LIGHTING, RECEPTACLES, FIRE
// ALARM…), descriptions that wrap onto a second line, and sometimes two symbols
// per row under EMERGENCY | NORMAL column headers. Abbreviation lists,
// one-line / riser symbols, mounting-height diagrams, tag examples and notes
// share the sheet and are not devices on a floor plan.
//
// "Withheld, never guessed": a row is only a row when a description has linework
// beside it; the kind is a suggestion the estimator confirms.

export type Span = { str: string; x0: number; y0: number; x1: number; y1: number };
export type Rect = [[number, number], [number, number]];
export type LegendKind = "count" | "run" | "skip";
export interface LegendSymbol { rect: Rect; segments: number; variant: string | null }
export interface LegendRow {
  id: string;
  section: string;          // nearest section heading above, in the row's column ("" when none)
  description: string;      // wrapped lines joined
  symbols: LegendSymbol[];  // left → right; two when the row has EMERGENCY | NORMAL symbols
  marks: string[];          // short text drawn inside the symbol cell ("GFCI", "LV", "WP")
  kind: LegendKind;         // suggested: count a device, trace a run, or skip
  reason: string;           // why the kind was suggested (shown in the review)
  at: [number, number];     // the description's first line, top-left (image px)
}

type Line = { text: string; x0: number; x1: number; y0: number; y1: number; h: number };

/** Text spans → lines: same baseline, close together (a wide gap starts a new cell). */
export function spansToLines(spans: Span[]): Line[] {
  const items = spans
    .map((s) => ({ ...s, str: String(s.str || "").replace(/\s+/g, " ").trim() }))
    .filter((s) => s.str && s.x1 > s.x0 && s.y1 > s.y0)
    .sort((a, b) => a.y1 - b.y1 || a.x0 - b.x0);
  const rows: typeof items[] = [];
  for (const s of items) {
    const r = rows[rows.length - 1];
    const h = s.y1 - s.y0;
    if (r && Math.abs(s.y1 - r[0].y1) <= Math.max(1, h * 0.4)) r.push(s); else rows.push([s]);
  }
  const out: Line[] = [];
  for (const r of rows) {
    r.sort((a, b) => a.x0 - b.x0);
    let cur: typeof r = [];
    const flush = () => {
      if (!cur.length) return;
      const y0 = Math.min(...cur.map((c) => c.y0)), y1 = Math.max(...cur.map((c) => c.y1));
      out.push({ text: cur.map((c) => c.str).join(" ").replace(/\s+/g, " ").trim(), x0: cur[0].x0, x1: cur[cur.length - 1].x1, y0, y1, h: y1 - y0 });
      cur = [];
    };
    for (const s of r) {
      const p = cur[cur.length - 1];
      const h = Math.max(s.y1 - s.y0, p ? p.y1 - p.y0 : 0);
      if (p && s.x0 - p.x1 > h * 1.8) flush();
      cur.push(s);
    }
    flush();
  }
  return out;
}

// sections whose symbols are not devices on a floor plan
const SKIP_SECTION_RE = /ABBREVIATION|SCHEMATIC|ONE[- ]?LINE|RISER|GENERAL NOTES|SHEET NOTES|KEY ?NOTES|SHEET NAMING|TAG NAMING|NAMING STANDARD|CIRCUIT LEGEND|MOUNTING HEIGHT|DRAWING INDEX|SHEET INDEX|WORK DEFINITION|ANNOTATION|REVISION/i;
// column captions, not sections
const CAPTION_RE = /^(SYMBOLS?|DESCRIPTION|DESC\.?|MTG\.? ?HT\.?|MOUNTING( HEIGHT)?|CIRCUITS?|EMERGENCY|NORMAL|ABB\.?|NOTES?|TYPE|REMARKS)(\s+(SYMBOLS?|DESCRIPTION|MTG\.? ?HT\.?|EMERGENCY|NORMAL))*$/i;
// a row that is wiring or raceway: traced as a run, not counted
const RUN_RE = /\b(CONDUIT|RACEWAY|HOME ?RUN|HOMERUN|BUSWAY|BUS DUCT|WIREWAY|WIREMOLD|CABLE TRAY|CABLE BUS|DUCT ?BANK|FEEDER|CIRCUITRY|WIRING|SURFACE METAL|FLEXIBLE|GROUNDING CONDUCTOR|BARE COPPER)\b/i;
// a row that is notation, not a device
const SKIP_ROW_RE = /\b(CALL ?OUT|DETAIL (NUMBER|IDENTIFICATION|CALL)|SECTION MARK|NORTH ARROW|KEY ?NOTE|FLAG NOTE|CONSTRUCTION NOTE|DEMOLITION NOTE|SHEET NOTE|MATCH ?LINE|REVISION|ELEVATION|HATCH|PLENUM ZONE|BOUNDARY|TITLE BLOCK|SHEET TITLE|DRAWING (NUMBER|TITLE)|GRID LINE|COLUMN LINE|LEVEL CALLOUT|ROOM (NAME|NUMBER)|DIMENSION)\b|^[A-Z#*"]{1,4} INDICATES\b|^LIGHT(ER)? LINE|^DASH(ED)? LINE|^ALL DEVICES WITH/i;

const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

function kindOf(desc: string, section: string, marks: string[] = [], segments = 99): { kind: LegendKind; reason: string } {
  if (SKIP_SECTION_RE.test(section)) return { kind: "skip", reason: `section “${section}” is not floor-plan devices` };
  // a letter-code table ("RECEPTACLE TYPES": A = arc fault, G = GFCI) qualifies other devices
  if (/\b(TYPES|MODIFIERS|SUFFIX(ES)?|SUBSCRIPTS?)\b/i.test(section) || (marks.length && segments <= 3)) return { kind: "skip", reason: `letter code${marks.length ? ` ${marks.join("/")}` : ""} — qualifies other devices` };
  if (SKIP_ROW_RE.test(desc)) return { kind: "skip", reason: "notation, not a device" };
  if (RUN_RE.test(desc) || /RACEWAY|WIRING|CABLING/i.test(section)) return { kind: "run", reason: "wiring or raceway — traced as a run" };
  return { kind: "count", reason: "device symbol" };
}

const inRect = (x: number, y: number, r: Rect) => x >= r[0][0] && x <= r[1][0] && y >= r[0][1] && y <= r[1][1];

/**
 * Read the legend inside `region` (image px). Rows come back in reading order:
 * by column (left to right), then top to bottom.
 */
export function readLegend(spans: Span[], segs: ArrayLike<number>, region: Rect): LegendRow[] {
  const R: Rect = [[Math.min(region[0][0], region[1][0]), Math.min(region[0][1], region[1][1])], [Math.max(region[0][0], region[1][0]), Math.max(region[0][1], region[1][1])]];
  const lines = spansToLines(spans.filter((s) => inRect((s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, R)));
  if (!lines.length) return [];
  const textH = median(lines.filter((l) => /[A-Za-z]{3}/.test(l.text)).map((l) => l.h)) || 10;
  // short segments only: table rules and borders are long
  const S: number[][] = [];
  const maxSeg = textH * 6;
  for (let i = 0; i + 3 < segs.length; i += 4) {
    const a = segs[i], b = segs[i + 1], c = segs[i + 2], d = segs[i + 3];
    const L = Math.hypot(c - a, d - b);
    if (L > 0.1 && L <= maxSeg && inRect(a, b, R) && inRect(c, d, R)) S.push([a, b, c, d, L]);
  }
  const isWords = (l: Line) => /[A-Za-z]{3}/.test(l.text);
  // underline under a line (section headings are often underlined)
  const underlined = (l: Line) => {
    for (let i = 0; i + 3 < segs.length; i += 4) {
      const a = segs[i], b = segs[i + 1], c = segs[i + 2], d = segs[i + 3];
      if (Math.abs(b - d) > 0.5) continue;
      const y = (b + d) / 2;
      if (y < l.y1 - 0.5 || y > l.y1 + l.h * 0.6) continue;
      const lo = Math.min(a, c), hi = Math.max(a, c);
      if (lo <= l.x0 + l.h && hi >= l.x1 - l.h && hi - lo <= (l.x1 - l.x0) * 1.6) return true;
    }
    return false;
  };

  // the symbol cell of each line: linework to its left, up to the nearest text
  type Cand = { line: Line; syms: { rect: Rect; segments: number; ids: number[] }[]; marks: string[] };
  const cands: Cand[] = [];
  const headings: Line[] = [];
  for (const l of lines) {
    if (!isWords(l)) continue;
    // clearly larger, all-caps words alone are a section heading, never a row
    if (l.h >= textH * 1.4 && l.text === l.text.toUpperCase() && /^[A-Z][A-Z &/,'-]*[A-Z]:?$/.test(l.text) && !CAPTION_RE.test(l.text)) { headings.push(l); continue; }
    const band0 = l.y0 - l.h * 0.9, band1 = l.y1 + l.h * 0.6;
    let left = l.x0 - l.h * 14;
    for (const o of lines) if (o !== l && o.x1 < l.x0 - 1 && o.x1 > left && o.y1 > band0 && o.y0 < band1 && o.text.length > 5) left = o.x1 + 1;
    const ids: number[] = [];
    S.forEach((s, i) => { if (Math.min(s[0], s[2]) >= left && Math.max(s[0], s[2]) <= l.x0 - 1 && Math.min(s[1], s[3]) >= band0 && Math.max(s[1], s[3]) <= band1) ids.push(i); });
    const len = ids.reduce((n, i) => n + S[i][4], 0);
    const marks = lines.filter((o) => { const cy = (o.y0 + o.y1) / 2; return o !== l && o.x0 >= left && o.x1 <= l.x0 && cy >= l.y0 - l.h * 0.35 && cy <= l.y1 + l.h * 0.35 && o.text.length <= 5; }).map((o) => o.text);
    if (ids.length >= 2 && len >= l.h * 0.8) {
      // split the cell into symbols at clear horizontal gaps (EMERGENCY | NORMAL)
      ids.sort((p, q) => Math.min(S[p][0], S[p][2]) - Math.min(S[q][0], S[q][2]));
      const groups: number[][] = [];
      let reach = -Infinity;
      for (const i of ids) {
        const lo = Math.min(S[i][0], S[i][2]), hi = Math.max(S[i][0], S[i][2]);
        if (lo - reach > l.h * 0.8) groups.push([]);
        groups[groups.length - 1].push(i);
        reach = Math.max(reach, hi);
      }
      const syms = groups
        .filter((g) => g.reduce((n, i) => n + S[i][4], 0) >= l.h * 0.5)
        .map((g) => {
          const xs = g.flatMap((i) => [S[i][0], S[i][2]]), ys = g.flatMap((i) => [S[i][1], S[i][3]]);
          return { rect: [[Math.min(...xs) - 1, Math.min(...ys) - 1], [Math.max(...xs) + 1, Math.max(...ys) + 1]] as Rect, segments: g.length, ids: g };
        });
      if (syms.length) { cands.push({ line: l, syms, marks }); continue; }
    }
    // no symbol: a heading when it is bigger or underlined, all caps, short, not a caption
    // a heading is words (no digits, ≥5 letters) standing alone on its line —
    // an abbreviation code or a panel tag has its meaning right beside it
    const caps = l.text === l.text.toUpperCase();
    const wordy = /^[A-Z][A-Z &/,'-]*[A-Z]:?$/.test(l.text) && (l.text.match(/[A-Z]/g) || []).length >= 5;
    const alone = !lines.some((o) => o !== l && Math.abs(o.y1 - l.y1) <= l.h * 0.5 && o.x0 > l.x1 && o.x0 - l.x1 <= l.h * 12 && !CAPTION_RE.test(o.text));
    const big = l.h >= textH * 1.4;   // clearly larger type is a heading even with a caption beside it
    if (caps && wordy && (alone || big) && l.text.length <= 48 && !CAPTION_RE.test(l.text) && (l.h >= textH * 1.15 || underlined(l))) headings.push(l);
  }

  // continuation lines: no symbol, same left edge, just below a row's last line
  const rows: { cand: Cand; text: string[]; last: Line }[] = [];
  const consumed = new Set<Line>();
  const sameCell = (a: Cand, b: Cand) => {
    // a wrapped description re-finds the same symbol: same segment ids
    const A = new Set(a.syms.flatMap((s) => s.ids));
    const B = b.syms.flatMap((s) => s.ids);
    return B.length > 0 && B.filter((i) => A.has(i)).length / B.length >= 0.45;
  };
  const sorted = [...cands].sort((a, b) => a.line.x0 - b.line.x0 || a.line.y0 - b.line.y0);
  for (const c of sorted) {
    const prev = rows.find((r) => Math.abs(r.cand.line.x0 - c.line.x0) <= c.line.h * 1.5 && c.line.y0 - r.last.y1 <= c.line.h * 1.2 && c.line.y0 > r.last.y0 && sameCell(r.cand, c));
    if (prev) { prev.text.push(c.line.text); prev.last = c.line; consumed.add(c.line); continue; }
    rows.push({ cand: c, text: [c.line.text], last: c.line });
  }
  const isHeading = new Set(headings);
  for (const l of lines) {
    if (!isWords(l) || consumed.has(l) || isHeading.has(l) || cands.some((c) => c.line === l)) continue;
    if (l.h >= textH * 1.3) continue;   // larger type is never the rest of a description
    const r = rows
      .filter((r) => Math.abs(r.cand.line.x0 - l.x0) <= l.h * 1.5 && l.y0 > r.last.y0 && l.y0 - r.last.y1 <= l.h * 1.2)
      .sort((a, b) => b.last.y1 - a.last.y1)[0];
    if (r) { r.text.push(l.text); r.last = l; consumed.add(l); }
  }

  // EMERGENCY | NORMAL captions over a column name a two-symbol row's variants
  const variantNames = (c: Cand): (string | null)[] => {
    if (c.syms.length < 2) return c.syms.map(() => null);
    const caps = spans.map((o) => ({ ...o, text: String(o.str || "").trim() })).filter((o) => /^(EMERGENCY|NORMAL|EMER\.?|NORM\.?)$/i.test(o.text) && o.y1 <= c.line.y0 && o.x1 >= c.syms[0].rect[0][0] - c.line.h * 3 && o.x0 <= c.line.x0);
    return c.syms.map((s) => {
      const cx = (s.rect[0][0] + s.rect[1][0]) / 2;
      const best = caps.filter((o) => Math.abs((o.x0 + o.x1) / 2 - cx) <= c.line.h * 4).sort((a, b) => b.y1 - a.y1 || Math.abs((a.x0 + a.x1) / 2 - cx) - Math.abs((b.x0 + b.x1) / 2 - cx))[0];
      return best ? (/^E/i.test(best.text) ? "Emergency" : "Normal") : null;
    });
  };

  const sectionOf = (c: Cand) => {
    const colLeft = c.syms[0].rect[0][0] - c.line.h * 2;
    const h = headings
      .filter((o) => o.y1 <= c.line.y0 + 0.5 && o.x1 >= colLeft && o.x0 <= c.line.x1)
      .sort((a, b) => b.y1 - a.y1)[0];
    return h ? h.text : "";
  };

  return rows
    .map((r, i): LegendRow => {
      const description = r.text.join(" ").replace(/\s+/g, " ").trim();
      const section = sectionOf(r.cand);
      const names = variantNames(r.cand);
      const { kind, reason } = kindOf(description, section, r.cand.marks, r.cand.syms.reduce((n, s) => n + s.segments, 0));
      return {
        id: `lg-${i + 1}`,
        section, description, kind, reason,
        symbols: r.cand.syms.map((s, k) => ({ rect: s.rect, segments: s.segments, variant: names[k] ?? (r.cand.syms.length > 1 ? String.fromCharCode(65 + k) : null) })),
        marks: r.cand.marks,
        at: [r.cand.line.x0, r.cand.line.y0],
      };
    })
    .sort((a, b) => a.symbols[0].rect[0][0] - b.symbols[0].rect[0][0] || a.at[1] - b.at[1]);
}

/** A short item tag from a description: "DUPLEX RECEPTACLE, 120V" → "DUPLEX RECEPTACLE 120V". */
export function tagFromDescription(desc: string, variant: string | null = null, max = 28): string {
  let t = String(desc || "").toUpperCase().replace(/\(.*?\)/g, " ").replace(/[^A-Z0-9/#.\- ]+/g, " ").replace(/\s+/g, " ").trim();
  if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, "") || t.slice(0, max);
  const v = variant ? ` ${variant.slice(0, 4).toUpperCase()}` : "";
  return (t || "LEGEND ITEM") + v;
}

/**
 * The discipline a sheet number belongs to: the letters that lead it ("E101" →
 * "E", "FA-201" → "FA", "EI312.09" → "E"), or for a project-prefixed number
 * the token after the project ("EAT06-E-E-142-4" → "E"). null when unreadable.
 */
export function disciplineOf(sheetNumber: string | null | undefined): string | null {
  const n = String(sheetNumber || "").toUpperCase().trim();
  if (!n) return null;
  const parts = n.split("-");
  if (parts.length >= 3 && /\d/.test(parts[0])) return /^[A-Z]{1,3}$/.test(parts[1]) ? parts[1] : null;
  const m = n.match(/^([A-Z]{1,3})/);
  if (!m) return null;
  // "EI312" — a second letter that only qualifies the first (E-Interior) stays E;
  // known two-letter disciplines keep both letters
  const lead = m[1];
  if (/^(FA|FP|LV|TC|TL|TS|SE|SY|EL)$/.test(lead.slice(0, 2))) return lead.slice(0, 2);
  return lead[0];
}
