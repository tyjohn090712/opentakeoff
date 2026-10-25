// Table rules + the on-device OCR reader for panel schedules. Invariants:
//   - findVerticalRules finds long vertical rules in a raster (thick, broken
//     by speckle, a pixel of skew) and ignores glyph-height strokes;
//   - findHorizontalRules is the same on the other axis;
//   - rulesFromSegments merges a column border drawn cell-by-cell into one
//     rule, clips to the box, and drops short glyph strokes;
//   - cleanForOcr erases rules but keeps a glyph that touches one, and lifts
//     shading to white;
//   - readPanelTokens reads the circuit columns as strips, stops at the last
//     circuit number, and gives an implausible TRIP a single-line second look.
// All data here is synthetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findVerticalRules, findHorizontalRules, rulesFromSegments, hRulesFromSegments, cleanForOcr, toGray } from "../src/lib/panelRaster.js";
import { readPanelTokens, type OcrBox, type OcrRect } from "../src/lib/panelOcr.js";
import { parsePanelSchedule, panelTotals } from "../src/lib/panelSchedule.js";

function blank(w: number, h: number) { return new Uint8Array(w * h).fill(255); }
function vline(g: Uint8Array, w: number, x: number, y0: number, y1: number, thick = 2, v = 0) {
  for (let y = y0; y <= y1; y++) for (let k = 0; k < thick; k++) g[y * w + x + k] = v;
}
function hline(g: Uint8Array, w: number, y: number, x0: number, x1: number, thick = 2) {
  for (let x = x0; x <= x1; x++) for (let k = 0; k < thick; k++) g[(y + k) * w + x] = 0;
}

test("findVerticalRules: long rules found, glyph strokes ignored, speckle bridged", () => {
  const w = 300, h = 400, g = blank(w, h);
  vline(g, w, 20, 10, 390, 3);
  vline(g, w, 150, 10, 390);
  for (const y of [100, 101, 230]) { g[y * w + 150] = 255; g[y * w + 151] = 255; }   // JPEG speckle breaks
  vline(g, w, 280, 10, 390);
  vline(g, w, 90, 50, 70);          // a glyph-height stroke
  const rules = findVerticalRules(g, w, h);
  const near = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 1);
  assert.ok(near(rules.map((r) => r.x), [21, 150.5, 280.5]), JSON.stringify(rules));
  assert.ok(rules.every((r) => r.y1 - r.y0 > 350), "speckle doesn't split a rule");
});

test("findVerticalRules: a pixel of skew still reads as one rule", () => {
  const w = 200, h = 600, g = blank(w, h);
  for (let y = 0; y < 600; y++) { const x = 100 + Math.floor(y / 200); g[y * w + x] = 0; g[y * w + x + 1] = 0; }
  const rules = findVerticalRules(g, w, h);
  assert.equal(rules.length, 1);
  assert.ok(rules[0].y1 - rules[0].y0 > 550);
});

test("findHorizontalRules mirrors the vertical finder", () => {
  const w = 400, h = 200, g = blank(w, h);
  hline(g, w, 50, 10, 390);
  hline(g, w, 120, 10, 390);
  const rules = findHorizontalRules(g, w, h);
  assert.equal(rules.length, 2);
  assert.ok(Math.abs(rules[0].y - 50.5) <= 1 && Math.abs(rules[1].y - 120.5) <= 1, JSON.stringify(rules));
  assert.ok(rules.every((r) => r.x1 - r.x0 > 370));
});

test("rulesFromSegments: cell-by-cell borders merge, short strokes drop, box clips", () => {
  const segs = [
    // a column border drawn as three cell edges
    100, 50, 100, 70, 100, 70, 100, 90, 100.4, 90, 100.4, 110,
    // the right border, one stroke running past the box
    300, 0, 300, 500,
    // a glyph stroke
    200, 60, 200, 63,
    // a diagonal (never a rule)
    150, 50, 160, 110,
  ];
  const rules = rulesFromSegments(segs, { x0: 50, y0: 40, x1: 350, y1: 140 });
  assert.equal(rules.length, 2);
  assert.ok(Math.abs(rules[0].x - 50) < 1 && rules[0].y0 === 10 && rules[0].y1 === 70, "merged + region-local");
  assert.ok(rules[1].y0 === 0 && rules[1].y1 === 100, "clipped to the box");
});

test("hRulesFromSegments: row borders drawn cell by cell merge along x, clip to the box, drop slivers", () => {
  const segs = [
    // one row border drawn as three cells
    100, 60, 160, 60, 160, 60.3, 230, 60.3, 230, 60, 300, 60,
    // a border in a merged cell: only the right part exists
    400, 80, 500, 80,
    // too short, vertical, and outside the box
    120, 90, 124, 90, 150, 100, 150, 140, 100, 400, 500, 400,
  ];
  const rules = hRulesFromSegments(segs, { x0: 90, y0: 40, x1: 480, y1: 200 });
  assert.equal(rules.length, 2);
  assert.ok(Math.abs(rules[0].y - 20.1) < 0.5 && rules[0].x0 === 10 && rules[0].x1 === 210, JSON.stringify(rules[0]));
  assert.ok(rules[1].y === 40 && rules[1].x0 === 310 && rules[1].x1 === 390, "clipped to the box");
});

test("cleanForOcr: rules erased, a glyph touching one keeps its body, shading lifts", () => {
  const w = 120, h = 80, g = blank(w, h);
  vline(g, w, 60, 0, 79, 2);
  for (let y = 30; y < 50; y++) for (let x = 40; x < 58; x++) g[y * w + x] = 0;   // a fat glyph near the rule
  for (let y = 0; y < 20; y++) for (let x = 0; x < 30; x++) g[y * w + x] = 215;   // shaded cell
  const rules = findVerticalRules(g, w, h);
  for (const binarize of [true, false]) {
    const out = cleanForOcr(g, w, h, rules, [], { binarize });
    assert.equal(out[10 * w + 60], 255, "rule gone");
    assert.ok(out[40 * w + 45] < 100, "glyph kept");
    assert.equal(out[5 * w + 5], 255, "shading lifted");
  }
});

test("toGray weights RGBA to luma", () => {
  const g = toGray(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1);
  assert.ok(g[0] > 250 && g[1] === 0);
});

// ── readPanelTokens with a fake OCR engine ───────────────────────────────────
// A synthetic two-sided panel "printed" as an answer key: the fake engine
// returns whatever text sits inside the rect it's asked to read, in the mode's
// granularity. Sparse mode drops one-character words (as Tesseract does on a
// ruled table) so the strip reads are what recover them.
type Word = { text: string; x: number; y: number };
const COLS = [0, 40, 240, 280, 330, 380, 430, 480, 530, 570, 770, 810];
const RULES = COLS.map((x) => ({ x, y0: 40, y1: 400 }));
function panelWords(): Word[] {
  const ws: Word[] = [
    { text: "PANEL:", x: 4, y: 20 }, { text: "LP-2", x: 50, y: 20 },
    { text: "CKT", x: 4, y: 60 }, { text: "DESCRIPTION", x: 60, y: 60 }, { text: "POLES", x: 244, y: 60 }, { text: "TRIP", x: 284, y: 60 },
    { text: "A", x: 350, y: 60 }, { text: "B", x: 400, y: 60 }, { text: "C", x: 450, y: 60 },
    { text: "TRIP", x: 484, y: 60 }, { text: "POLES", x: 534, y: 60 }, { text: "DESCRIPTION", x: 590, y: 60 }, { text: "CKT", x: 774, y: 60 },
  ];
  for (let k = 0; k < 6; k++) {
    const y = 80 + 20 * k;
    ws.push({ text: String(2 * k + 1), x: 4, y }, { text: String(2 * k + 2), x: 774, y });
    ws.push({ text: k === 2 ? "30A" : "20A", x: 284, y }, { text: "1", x: 244, y }, { text: `LOAD ${k + 1}`, x: 44, y });
    ws.push({ text: "20A", x: 484, y }, { text: "1", x: 534, y }, { text: "SPARE", x: 574, y });
  }
  ws.push({ text: "TOTALS", x: 44, y: 220 });
  return ws;
}
function fakeEngine(words: Word[], fumble: { text: string; y: number } | null) {
  const calls: { rect: OcrRect; mode: string }[] = [];
  const inRect = (w: Word, r: OcrRect) => w.x >= r.left - 2 && w.x < r.left + r.width && w.y - 5 >= r.top && w.y - 5 <= r.top + r.height;
  const box = (w: Word, text = w.text): OcrBox => ({ text, x0: w.x, y0: w.y - 10, x1: w.x + text.length * 6, y1: w.y });
  return {
    calls,
    recognize: async (rect: OcrRect, mode: "sparse" | "block" | "line") => {
      calls.push({ rect, mode });
      const hit = words.filter((w) => inRect(w, rect));
      if (mode === "sparse") return hit.filter((w) => w.text.length > 1 && !/^\d+$/.test(w.text)).map((w) => box(w));
      if (mode === "line") return hit.map((w) => box(w));
      // block: the first time it sees the fumbled cell it misreads it
      return hit.map((w) => {
        if (fumble && w.y === fumble.y && w.text === "30A") { const t = fumble.text; fumble = null; return box(w, t); }
        return box(w);
      });
    },
  };
}

test("readPanelTokens: strips recover sparse-dropped cells, table ends at the last circuit number", async () => {
  const eng = fakeEngine(panelWords(), null);
  const toks = await readPanelTokens(810, 400, RULES, eng.recognize);
  const res = parsePanelSchedule(toks, { rules: RULES });
  assert.ok(res.panel, res.panel ? "" : (res as { reason: string }).reason);
  assert.equal(res.panel.name, "LP-2");
  assert.equal(res.panel.circuits.length, 12);
  assert.equal(res.panel.circuits.filter((c) => c.kind === "spare").length, 6);
  const stripCalls = eng.calls.filter((c) => c.mode === "block");
  assert.equal(stripCalls.length, 8, "CKT/DESC/TRIP/POLES × two sides — never the phase columns");
  const descStrip = stripCalls.find((c) => c.rect.left === 42);
  assert.ok(descStrip && descStrip.rect.top + descStrip.rect.height < 240, "strips below the table aren't read");
});

test("readPanelTokens: an implausible TRIP gets a single-line second look", async () => {
  const eng = fakeEngine(panelWords(), { text: "0A", y: 120 });
  const toks = await readPanelTokens(810, 400, RULES, eng.recognize);
  assert.equal(eng.calls.filter((c) => c.mode === "line").length, 1);
  const res = parsePanelSchedule(toks, { rules: RULES });
  assert.ok(res.panel);
  const c5 = res.panel.circuits.find((c) => c.ckts.includes(5));
  assert.equal(c5?.trip, 30);
  assert.equal(c5?.kind, "load");
});

test("readPanelTokens: a two-line description in a merged cell gets ONE breaker size, not one per line", async () => {
  // a 3-row merged cell: two description lines (rows 1 and 3) around a single TRIP centered on row 2
  const words: Word[] = [
    { text: "PANEL:", x: 4, y: 20 }, { text: "LP-3", x: 50, y: 20 },
    { text: "CKT", x: 4, y: 60 }, { text: "DESCRIPTION", x: 60, y: 60 }, { text: "POLES", x: 244, y: 60 }, { text: "TRIP", x: 284, y: 60 },
    { text: "TRIP", x: 484, y: 60 }, { text: "POLES", x: 534, y: 60 }, { text: "DESCRIPTION", x: 590, y: 60 }, { text: "CKT", x: 774, y: 60 },
  ];
  for (let k = 0; k < 6; k++) words.push({ text: String(2 * k + 1), x: 4, y: 80 + 20 * k }, { text: String(2 * k + 2), x: 774, y: 80 + 20 * k });
  words.push({ text: "TEMP POWER", x: 44, y: 90 }, { text: "SITE-PNL01", x: 44, y: 130 }, { text: "125A", x: 284, y: 110 }, { text: "3", x: 244, y: 110 });
  for (let k = 3; k < 6; k++) words.push({ text: "SPARE", x: 44, y: 80 + 20 * k }, { text: "20A", x: 284, y: 80 + 20 * k }, { text: "1", x: 244, y: 80 + 20 * k });
  for (let k = 0; k < 6; k++) words.push({ text: "SPARE", x: 574, y: 80 + 20 * k }, { text: "20A", x: 484, y: 80 + 20 * k }, { text: "1", x: 534, y: 80 + 20 * k });
  const eng = fakeEngine(words, null);
  const toks = await readPanelTokens(810, 400, RULES, eng.recognize);
  const trips = toks.filter((t) => /125/.test(t.str));
  assert.equal(trips.length, 1, "one 125A reading for the cell, however many description lines it has");
  const res = parsePanelSchedule(toks, { rules: RULES });
  assert.ok(res.panel);
  assert.equal(res.panel.circuits.filter((c) => c.trip === 125).length, 1);
  assert.equal(panelTotals(res.panel.circuits).withheld, 0);
});
