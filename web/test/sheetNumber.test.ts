import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSheetNumber } from "../src/lib/sheets.ts";

// Identity viewport: item transform [fs,0,0,fs,x,y] lands at (x,y) with glyph
// height fs. Page is 1000×800; the title-block gate is x ≥ 600, y ≥ 440.
const VP = { width: 1000, height: 800, transform: [1, 0, 0, 1, 0, 0] };
const item = (str: string, x: number, y: number, fs: number, width?: number) => ({
  str,
  transform: [fs, 0, 0, fs, x, y],
  ...(width != null ? { width } : {}),
});

test("an intact title-block number still wins", () => {
  const tc = {
    items: [
      item("A-101", 920, 760, 30),
      item("GMP-3", 880, 500, 8), // sheet-issue row: smaller, higher up
      item("SCALE: 1/8\" = 1'-0\"", 700, 700, 10),
    ],
  };
  assert.equal(extractSheetNumber(tc, VP), "A-101");
});

test("a sheet number split into glyph runs is joined and beats a lone lookalike", () => {
  // the DocuSign-flattened Johnston County set: "M-121A" arrives as three runs
  // while the sheet-issue table's "GMP-3" is one item — the bug read GMP-3
  const tc = {
    items: [
      item("M", 920, 780, 28, 18),
      item("-", 940, 780, 28, 8),
      item("121A", 950, 780, 28, 70),
      item("GMP-3", 880, 500, 8, 30),
    ],
  };
  assert.equal(extractSheetNumber(tc, VP), "M-121A");
});

test("fragments far apart on a baseline do not join", () => {
  // two tokens on one row separated by a column gap — the join must not
  // manufacture a candidate from them (and neither matches alone)
  const tc = {
    items: [
      item("121A", 700, 780, 10, 30),
      item("M", 900, 780, 10, 8), // 170px gap ≫ 1.2 × glyph height
    ],
  };
  assert.equal(extractSheetNumber(tc, VP), null);
});

test("no sheet-number-shaped text → null", () => {
  const tc = { items: [item("SECOND FLOOR", 900, 760, 20)] };
  assert.equal(extractSheetNumber(tc, VP), null);
});

// ── sheet titles: every sheet is named "number - title" ─────────────────────
import { extractSheetInfo, sheetDisplayName } from "../src/lib/sheets.ts";

test("title under a SHEET TITLE / DRAWING TITLE caption", () => {
  const tc = { items: [
    item("Drawing Title", 700, 690, 10, 60),
    item("FIRST FLOOR POWER PLAN", 700, 705, 10, 140),
    item("Drawing Number", 860, 690, 10, 70),
    item("E101", 860, 740, 30, 60),
    item("Issue Date", 700, 760, 10, 50),
  ] };
  assert.deepEqual(extractSheetInfo(tc, VP), { number: "E101", title: "FIRST FLOOR POWER PLAN" });
});

test("title after the caption on one line, and a title that wraps onto a second line", () => {
  const inline = { items: [item("SHEET TITLE: PANEL SCHEDULES", 640, 700, 10, 170), item("E601", 900, 760, 30, 60)] };
  assert.equal(extractSheetInfo(inline, VP).title, "PANEL SCHEDULES");
  const wrapped = { items: [
    item("SHEET TITLE", 640, 660, 8, 50),
    item("LEVEL 2", 640, 680, 12, 50),
    item("LIGHTING PLAN - AREA B", 640, 694, 12, 140),
    item("SCALE: 1/8\" = 1'-0\"", 640, 730, 8, 90),
    item("E202", 900, 760, 30, 60),
  ] };
  assert.equal(extractSheetInfo(wrapped, VP).title, "LEVEL 2 LIGHTING PLAN - AREA B");
});

test("unlabeled title (Revit-style): the sheet-word line nearest the number; the firm's address is not a title", () => {
  const tc = { items: [
    item("ACME ENGINEERING INC.", 860, 600, 9, 120),
    item("1200 MAIN STREET SUITE 400", 860, 612, 9, 150),
    item("ELECTRICAL", 840, 700, 14, 90),
    item("FIRE ALARM PLAN", 840, 716, 14, 120),
    item("E401", 880, 760, 30, 60),
  ] };
  assert.deepEqual(extractSheetInfo(tc, VP), { number: "E401", title: "ELECTRICAL FIRE ALARM PLAN" });
});

test("no readable title is withheld, not guessed: the number stands alone", () => {
  const tc = { items: [
    item("ACME ENGINEERING INC.", 860, 600, 9, 120),
    item("PROJECT NO. 24-118", 700, 700, 9, 90),
    item("DATE 03/06/2026", 700, 712, 9, 80),
    item("E101", 880, 760, 30, 60),
  ] };
  assert.deepEqual(extractSheetInfo(tc, VP), { number: "E101", title: null });
  assert.equal(sheetDisplayName("E101", null), "E101");
  assert.equal(sheetDisplayName("E101", "FIRST FLOOR POWER PLAN"), "E101 - FIRST FLOOR POWER PLAN");
  assert.equal(sheetDisplayName(null, null), "");
});
