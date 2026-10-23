// Panel-schedule importer (electrical fork, Wave 4). Invariants:
//   - a two-sided table reads odd circuits left, even right; a multi-pole
//     breaker spans its "--" continuation rows (Revit's default) OR its merged
//     cell (text on the middle row for 3-pole, between rows for 2-pole);
//   - SPARE = a breaker you buy, SPACE / PREPARED SPACE / a blank row = pole
//     positions only; "EV READY SPACE" WITH a breaker size is still a breaker;
//   - circuit numbers are a grid: a misread number ("1" for "11") is corrected
//     from the row pitch, a missing one is filled, never invented past the end;
//   - withheld, never guessed: a named load with no breaker, a non-standard
//     trip, an unreadable pole count — each comes back kind:"withheld" with a
//     reason, and a withheld 2-pole still holds both of its rows;
//   - a wrapped description in a merged cell joins its breaker;
//   - with the table's rules, a dropped one-letter header ("#", "P") is
//     recovered from the data and the column geometry;
//   - header ratings (VOLTS / BUS / MAIN / …) and the PANEL name are read;
//   - no circuit table → { panel: null, reason } (nothing invented).
// All data here is synthetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePanelSchedule, panelTotals, breakerLabel, parseTrip, parsePoles, type Token, type PanelCircuit } from "../src/lib/panelSchedule.js";
import type { Rule } from "../src/lib/panelRaster.js";

const H = 10;
type ColSpec = { name: string; x0: number; x1: number };

// a cell's words, left-aligned inside the column (text starts inside the rules)
function cell(col: ColSpec, text: string, y: number): Token[] {
  let x = col.x0 + 4;
  return text.split(/\s+/).filter(Boolean).map((w) => {
    const t = { str: w, x, y, h: H, w: w.length * 6 };
    x += w.length * 6 + 6;
    return t;
  });
}
const rulesFor = (cols: ColSpec[], y0: number, y1: number): Rule[] =>
  [...new Set(cols.flatMap((c) => [c.x0, c.x1]))].map((x) => ({ x, y0, y1 }));

// ── Revit-style two-sided table ("--" on continuation rows) ──────────────────
const RV = (() => {
  const c = (name: string, x0: number, x1: number) => ({ name, x0, x1 });
  return {
    LCKT: c("CKT", 0, 40), LDESC: c("CIRCUIT DESCRIPTION", 40, 240), LPOLES: c("POLES", 240, 280), LTRIP: c("TRIP", 280, 330),
    A: c("A", 330, 380), B: c("B", 380, 430), C: c("C", 430, 480),
    RTRIP: c("TRIP", 480, 530), RPOLES: c("POLES", 530, 570), RDESC: c("CIRCUIT DESCRIPTION", 570, 770), RCKT: c("CKT", 770, 810),
  };
})();
const RV_COLS = Object.values(RV);
const rowY = (k: number) => 80 + 20 * k;

type SideRow = { ckt?: string; desc?: string; trip?: string; poles?: string };
function revitPanel(rows: { L?: SideRow; R?: SideRow }[], opts: { title?: boolean; header?: boolean } = {}): Token[] {
  const toks: Token[] = [];
  if (opts.title !== false) {
    toks.push(...cell({ name: "", x0: 0, x1: 200 }, "PANEL: LP-1A", 20));
    toks.push(...cell({ name: "", x0: 330, x1: 600 }, "VOLTS: 208Y/120V 3PH 4W", 20));
    toks.push(...cell({ name: "", x0: 0, x1: 200 }, "MOUNTING: SURFACE", 38));
    toks.push(...cell({ name: "", x0: 330, x1: 600 }, "BUS AMPS: 225", 38));
    toks.push(...cell({ name: "", x0: 600, x1: 800 }, "MAIN: MLO", 38));
  }
  if (opts.header !== false) for (const col of RV_COLS) toks.push(...cell(col, col.name, 60));
  rows.forEach((r, k) => {
    const y = rowY(k);
    toks.push(...cell(RV.LCKT, r.L?.ckt ?? String(2 * k + 1), y));
    toks.push(...cell(RV.RCKT, r.R?.ckt ?? String(2 * k + 2), y));
    for (const [side, d, p, t] of [["L", RV.LDESC, RV.LPOLES, RV.LTRIP], ["R", RV.RDESC, RV.RPOLES, RV.RTRIP]] as const) {
      const sr = r[side];
      if (!sr) continue;
      if (sr.desc) toks.push(...cell(d, sr.desc, y));
      if (sr.poles) toks.push(...cell(p, sr.poles, y));
      if (sr.trip) toks.push(...cell(t, sr.trip, y));
    }
  });
  return toks;
}
const RV_RULES = rulesFor(RV_COLS, 50, 400);
const by = (cs: PanelCircuit[], ckt: number) => cs.find((c) => c.ckts.includes(ckt));

test("Revit two-sided: loads, spares, spaces, and '--' continuation spans", () => {
  const rows = [
    { L: { desc: "RECEPT RM 101", poles: "1", trip: "20 A" }, R: { desc: "EF-1", poles: "2", trip: "30 A" } },
    { L: { desc: "RECEPT RM 102", poles: "1", trip: "20 A" }, R: { desc: "--", poles: "--", trip: "--" } },
    { L: { desc: "RTU-1", poles: "3", trip: "60 A" }, R: { desc: "SPARE", poles: "1", trip: "20 A" } },
    { L: { desc: "--", poles: "--", trip: "--" }, R: { desc: "SPACE" } },
    { L: { desc: "--", poles: "--", trip: "--" }, R: {} },
  ];
  const res = parsePanelSchedule(revitPanel(rows), { rules: RV_RULES });
  assert.ok(res.panel, "parsed");
  const p = res.panel;
  assert.equal(p.name, "LP-1A");
  assert.equal(p.layout, "two-sided");
  assert.equal(p.positions, 10);
  assert.deepEqual(by(p.circuits, 5)?.ckts, [5, 7, 9], "3-pole spans its two '--' rows");
  assert.equal(by(p.circuits, 5)?.kind, "load");
  assert.deepEqual(by(p.circuits, 2)?.ckts, [2, 4], "2-pole spans its '--' row");
  assert.equal(by(p.circuits, 6)?.kind, "spare");
  assert.equal(by(p.circuits, 8)?.kind, "space");
  assert.equal(by(p.circuits, 10)?.kind, "space", "a blank row is a space");
  const t = panelTotals(p.circuits);
  assert.deepEqual(t.breakers.map((b) => `${breakerLabel(b.trip, b.poles)}×${b.count}`), ["20A 1P×3", "30A 2P×1", "60A 3P×1"]);
  assert.equal(t.spareCount, 1);
  assert.equal(t.loadCount, 4);
  assert.equal(t.spacePositions, 2);
  assert.equal(t.withheld, 0);
});

test("header ratings and panel name read from the title block", () => {
  const res = parsePanelSchedule(revitPanel([{ L: { desc: "LTG", poles: "1", trip: "20" } }]), { rules: RV_RULES });
  assert.ok(res.panel);
  assert.equal(res.panel.info.volts, "208Y/120V 3PH 4W");
  assert.equal(res.panel.info.bus, "225");
  assert.equal(res.panel.info.main, "MLO");
  assert.equal(res.panel.info.mounting, "SURFACE");
});

test("grid: a misread circuit number is corrected from the row pitch", () => {
  // OCR's classic drop: "11" → "1", "14" → "4"
  const rows = Array.from({ length: 8 }, (_, k) => ({ L: { desc: `LOAD ${k}`, poles: "1", trip: "20A" }, R: { desc: "SPARE", poles: "1", trip: "20A" } }));
  (rows[5] as { L: SideRow }).L.ckt = "1";
  (rows[6] as { R: SideRow }).R.ckt = "4";
  const res = parsePanelSchedule(revitPanel(rows), { rules: RV_RULES });
  assert.ok(res.panel);
  const nums = res.panel.circuits.flatMap((c) => c.ckts).sort((a, b) => a - b);
  assert.deepEqual(nums, Array.from({ length: 16 }, (_, i) => i + 1), "every number 1–16 exactly once");
  assert.equal(by(res.panel.circuits, 11)?.description, "LOAD 5");
  assert.equal(by(res.panel.circuits, 14)?.kind, "spare");
});

test("withheld, never guessed: no trip, non-standard trip, unreadable poles", () => {
  const rows = [
    { L: { desc: "AHU-1", poles: "2", trip: "" }, R: { desc: "WH-1", poles: "1", trip: "33A" } },
    { L: { desc: "--", poles: "--", trip: "--" }, R: { desc: "UH-2", poles: "?", trip: "20A" } },
    { L: { desc: "LTG", poles: "1", trip: "20A" }, R: { desc: "LTG", poles: "1", trip: "20A" } },
  ];
  const res = parsePanelSchedule(revitPanel(rows), { rules: RV_RULES });
  assert.ok(res.panel);
  const cs = res.panel.circuits;
  const ahu = by(cs, 1);
  assert.equal(ahu?.kind, "withheld");
  assert.deepEqual(ahu?.ckts, [1, 3], "a withheld 2-pole still holds its second row");
  assert.equal(by(cs, 3)?.kind, "withheld", "row 3 is not mistaken for a space");
  assert.match(by(cs, 2)?.reason ?? "", /standard/);
  assert.match(by(cs, 4)?.reason ?? "", /pole/);
  const t = panelTotals(cs);
  assert.equal(t.withheld, 3);
  assert.deepEqual(t.breakers.map((b) => `${breakerLabel(b.trip, b.poles)}×${b.count}`), ["20A 1P×2"], "withheld rows never reach the counts");
});

test("SPACE-labeled rows are spaces, but a breaker named '… SPACE' is a breaker", () => {
  const rows = [
    { L: { desc: "EV READY SPACE", poles: "2", trip: "40A" }, R: { desc: "PREPARED SPACE", poles: "1", trip: "--" } },
    { L: { desc: "--", poles: "--", trip: "--" }, R: { desc: "SPACE ONLY" } },
  ];
  const res = parsePanelSchedule(revitPanel(rows), { rules: RV_RULES });
  assert.ok(res.panel);
  assert.equal(by(res.panel.circuits, 1)?.kind, "load");
  assert.deepEqual(by(res.panel.circuits, 1)?.ckts, [1, 3]);
  assert.equal(by(res.panel.circuits, 2)?.kind, "space");
  assert.equal(by(res.panel.circuits, 4)?.kind, "space");
});

// ── merged-cell template ("#  AMP  P  LOAD DESCRIPTION …"), "#" dropped ──────
const MG = (() => {
  const c = (name: string, x0: number, x1: number) => ({ name, x0, x1 });
  return {
    LCKT: c("", 0, 30), LAMP: c("AMP", 30, 70), LP: c("", 70, 100), LDESC: c("LOAD DESCRIPTION", 100, 300), LTYPE: c("TYPE", 300, 340),
    A: c("A", 340, 390), B: c("B", 390, 440), C: c("C", 440, 490),
    RTYPE: c("TYPE", 490, 530), RDESC: c("LOAD DESCRIPTION", 530, 730), RP: c("", 730, 760), RAMP: c("AMP", 760, 800), RCKT: c("", 800, 830),
  };
})();
const MG_COLS = Object.values(MG);
test("merged cells: 3-pole centered on its middle row, 2-pole between rows, headers '#'/'P' missing", () => {
  const toks: Token[] = [];
  toks.push(...cell({ name: "", x0: 300, x1: 600 }, "PANEL: DP-2", 20));
  for (const col of MG_COLS) if (col.name) toks.push(...cell(col, col.name, 60));
  for (let k = 0; k < 8; k++) {
    toks.push(...cell(MG.LCKT, String(2 * k + 1), rowY(k)));
    toks.push(...cell(MG.RCKT, String(2 * k + 2), rowY(k)));
  }
  // left: 3-pole on 1-3-5 (text on row 3), 2-pole on 7-9 (text between rows)
  toks.push(...cell(MG.LAMP, "200", rowY(1)), ...cell(MG.LP, "3", rowY(1)), ...cell(MG.LDESC, "PANEL LP-1", rowY(1)));
  toks.push(...cell(MG.LAMP, "125", rowY(3.5)), ...cell(MG.LP, "2", rowY(3.5)), ...cell(MG.LDESC, "GATEHOUSE", rowY(3.5)));
  // left 11, 13 single SPARE breakers; 15 a prepared space
  toks.push(...cell(MG.LAMP, "20", rowY(5)), ...cell(MG.LP, "1", rowY(5)), ...cell(MG.LDESC, "SPARE", rowY(5)));
  toks.push(...cell(MG.LAMP, "20", rowY(6)), ...cell(MG.LP, "1", rowY(6)), ...cell(MG.LDESC, "SPARE", rowY(6)));
  toks.push(...cell(MG.LAMP, "--", rowY(7)), ...cell(MG.LP, "1", rowY(7)), ...cell(MG.LDESC, "PREPARED SPACE", rowY(7)));
  // right: a 3-pole on 2-4-6 whose wrapped description spans rows 2 and 4
  toks.push(...cell(MG.RDESC, "EV CHARGER (VERIFY", rowY(0.5)));
  toks.push(...cell(MG.RAMP, "50", rowY(1)), ...cell(MG.RP, "3", rowY(1)));
  toks.push(...cell(MG.RDESC, "WITH OWNER)", rowY(1.5)));
  toks.push(...cell(MG.LDESC, "TOTALS", rowY(9)));
  const res = parsePanelSchedule(toks, { rules: rulesFor(MG_COLS, 50, 400) });
  assert.ok(res.panel, res.panel ? "" : (res as { reason: string }).reason);
  const cs = res.panel.circuits;
  assert.equal(res.panel.name, "DP-2");
  assert.deepEqual(by(cs, 1)?.ckts, [1, 3, 5]);
  assert.equal(by(cs, 1)?.trip, 200);
  assert.deepEqual(by(cs, 7)?.ckts, [7, 9], "between-rows text spans the two rows around it");
  assert.equal(by(cs, 7)?.poles, 2);
  assert.equal(by(cs, 11)?.kind, "spare");
  assert.equal(by(cs, 15)?.kind, "space");
  const ev = by(cs, 2);
  assert.deepEqual(ev?.ckts, [2, 4, 6]);
  assert.equal(ev?.description, "EV CHARGER (VERIFY WITH OWNER)", "the wrapped line joins its breaker");
  assert.equal(ev?.kind, "load");
  assert.equal(by(cs, 8)?.kind, "space");
  assert.equal(res.panel.positions, 16);
});

test("one-sided table without rules (header-band columns)", () => {
  const cols = { CKT: { name: "CKT", x0: 0, x1: 40 }, DESC: { name: "DESCRIPTION", x0: 60, x1: 300 }, TRIP: { name: "TRIP", x0: 320, x1: 360 }, P: { name: "POLES", x0: 380, x1: 420 } };
  const toks: Token[] = [...cell(cols.CKT, "CKT", 60), ...cell({ ...cols.DESC, x0: 140 }, "DESCRIPTION", 60), ...cell(cols.TRIP, "TRIP", 60), ...cell(cols.P, "POLES", 60)];
  const data = [["1", "LIGHTING", "20", "1"], ["2", "RECEPT", "20", "1"], ["3", "WATER HEATER", "30", "2"], ["4", "--", "--", "--"], ["5", "SPARE", "20", "1"]];
  data.forEach(([c, d, t, p], k) => toks.push(...cell(cols.CKT, c, rowY(k)), ...cell(cols.DESC, d, rowY(k)), ...cell(cols.TRIP, t, rowY(k)), ...cell(cols.P, p, rowY(k))));
  const res = parsePanelSchedule(toks);
  assert.ok(res.panel, res.panel ? "" : (res as { reason: string }).reason);
  assert.equal(res.panel.layout, "single");
  assert.deepEqual(by(res.panel.circuits, 3)?.ckts, [3, 4], "one-sided panels step by 1");
  assert.equal(by(res.panel.circuits, 2)?.description, "RECEPT");
  assert.equal(panelTotals(res.panel.circuits).breakerCount, 4);
});

test("no circuit table → null with a reason (nothing invented)", () => {
  const toks = [...cell({ name: "", x0: 0, x1: 400 }, "LIGHTING FIXTURE SCHEDULE", 20), ...cell({ name: "", x0: 0, x1: 400 }, "TYPE MANUFACTURER LAMPS", 40)];
  const res = parsePanelSchedule(toks);
  assert.equal(res.panel, null);
  assert.match((res as { reason: string }).reason, /header/);
});

test("rules from a summary table below don't split circuit columns", () => {
  // a stray rule mid-DESCRIPTION that starts below the header row
  const rules = [...RV_RULES, { x: 140, y0: 200, y1: 400 }];
  const res = parsePanelSchedule(revitPanel([{ L: { desc: "BIG LONG DESCRIPTION", poles: "1", trip: "20A" } }]), { rules });
  assert.equal(res.panel && by(res.panel.circuits, 1)?.description, "BIG LONG DESCRIPTION");
});

test("cell parsers: trip and poles shapes", () => {
  assert.deepEqual(parseTrip("20 A"), { trip: 20 });
  assert.deepEqual(parseTrip("125A"), { trip: 125 });
  assert.deepEqual(parseTrip("20/2"), { trip: 20, poles: 2 });
  assert.deepEqual(parseTrip("2O A"), { trip: 20 }, "O→0 inside a numeric cell");
  assert.equal(parseTrip("--"), null);
  assert.equal(parseTrip("SPARE"), null);
  assert.equal(parsePoles("1"), 1);
  assert.equal(parsePoles("3P"), 3);
  assert.equal(parsePoles("4"), null);
  assert.equal(parsePoles("--"), null);
});

test("the table ends at its circuit numbers: a totals line below never becomes a circuit", () => {
  const rows = [
    { L: { desc: "DEMAND CONTROL PANEL", poles: "1", trip: "20A" }, R: { desc: "TOTAL STATION RECEPT", poles: "1", trip: "20A" } },
    { L: { desc: "LTG", poles: "1", trip: "20A" }, R: { desc: "SPARE", poles: "1", trip: "20A" } },
  ];
  const toks = revitPanel(rows);
  // a whole-cell text item sitting in the left DESCRIPTION column, a row below the last circuit
  toks.push({ str: "TOTAL CONNECTED LOAD: 18.4 KVA", x: RV.LDESC.x0 + 4, y: rowY(2) + 4, h: H });
  toks.push({ str: "NOTES: SEE ONE-LINE", x: RV.LDESC.x0 + 4, y: rowY(4), h: H });
  const res = parsePanelSchedule(toks, { rules: RV_RULES });
  assert.ok(res.panel);
  assert.equal(res.panel.positions, 4);
  assert.equal(res.panel.circuits.length, 4);
  assert.equal(by(res.panel.circuits, 1)?.description, "DEMAND CONTROL PANEL", "a stop word inside a description doesn't end the table");
  assert.equal(panelTotals(res.panel.circuits).withheld, 0);
});

test("a 'PANELBOARD SCHEDULE' banner is never the panel's name", () => {
  const toks = revitPanel([{ L: { desc: "LTG", poles: "1", trip: "20A" } }], { title: false });
  toks.push({ str: "PANELBOARD SCHEDULE", x: 300, y: 8, h: H });
  assert.equal((parsePanelSchedule(toks, { rules: RV_RULES }) as { panel: { name: string } }).panel.name, "");
  toks.push({ str: "PANEL: LP-2B", x: 4, y: 24, h: H });
  assert.equal((parsePanelSchedule(toks, { rules: RV_RULES }) as { panel: { name: string } }).panel.name, "LP-2B");
});
