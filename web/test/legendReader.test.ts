// Legend reader (electrical fork): a boxed symbol legend becomes rows of
// symbol(s) + description + section + suggested kind. Synthetic legends only —
// real legend pages are confidential bid documents.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readLegend, spansToLines, tagFromDescription, disciplineOf } from "../src/lib/legendReader.ts";

const H = 10;   // description text height
const span = (str: string, x: number, y: number, h = H) => ({ str, x0: x, y0: y - h, x1: x + str.length * h * 0.6, y1: y });
// a small symbol: a circle-ish square with a tick, at (x, y) center
const sym = (x: number, y: number, r = 6): number[] => [
  x - r, y - r, x + r, y - r, x + r, y - r, x + r, y + r, x + r, y + r, x - r, y + r, x - r, y + r, x - r, y - r, x, y - r, x, y - r - 5,
];

function legend() {
  const spans = [
    span("RECEPTACLES", 60, 20, 16),              // heading, larger type
    span("EMERGENCY", 20, 38, 7), span("NORMAL", 60, 38, 7),
    span("DUPLEX RECEPTACLE, 120V", 100, 60),
    span("DOUBLE DUPLEX RECEPTACLE, ABOVE COUNTER,", 100, 90),
    span("120V, CEILING MOUNTED", 100, 102),       // wraps onto a second line
    span("RACEWAYS", 60, 140, 16),
    span("RACEWAY CONCEALED IN CEILING OR WALL", 100, 170),
    span("ABBREVIATIONS", 400, 20, 16),
    span("AFF", 400, 60), span("ABOVE FINISHED FLOOR", 460, 60),
  ];
  const segs = [
    ...sym(30, 55), ...sym(70, 55),               // emergency | normal symbols, duplex row
    ...sym(30, 90), ...sym(70, 90),               // double duplex row (one symbol cell spans both lines)
    40, 166, 90, 166,                             // a raceway: one long-ish line… under maxSeg
    60, 160, 70, 172,                             // …and a tick
  ];
  return { spans, segs };
}

test("rows pair each description with its symbol(s) and section; two symbols name Emergency | Normal", () => {
  const { spans, segs } = legend();
  const rows = readLegend(spans, segs, [[0, 0], [700, 300]]);
  const duplex = rows.find((r) => r.description === "DUPLEX RECEPTACLE, 120V");
  assert.ok(duplex, "duplex row read");
  assert.equal(duplex!.section, "RECEPTACLES");
  assert.deepEqual(duplex!.symbols.map((s) => s.variant), ["Emergency", "Normal"]);
  assert.equal(duplex!.kind, "count");
  const dd = rows.find((r) => r.description.startsWith("DOUBLE DUPLEX"));
  assert.equal(dd!.description, "DOUBLE DUPLEX RECEPTACLE, ABOVE COUNTER, 120V, CEILING MOUNTED", "a wrapped description is one row");
  const race = rows.find((r) => r.description.startsWith("RACEWAY"));
  assert.equal(race!.kind, "run");
  assert.equal(race!.section, "RACEWAYS");
  assert.ok(!rows.some((r) => r.description.includes("ABOVE FINISHED FLOOR")), "an abbreviation without linework is not a row");
});

test("notation and non-plan sections are skipped with a reason; the kind is only a suggestion", () => {
  const spans = [
    span("ONE-LINE AND RISER DIAGRAMS", 60, 20, 16), span("CIRCUIT BREAKER", 100, 60),
    span("SYMBOLS", 60, 120, 16), span("DETAIL CALLOUT", 100, 160), span("W INDICATES WEATHERPROOF", 100, 200),
  ];
  const segs = [...sym(70, 55), ...sym(70, 155), ...sym(70, 195)];
  const rows = readLegend(spans, segs, [[0, 0], [600, 300]]);
  const by = (d: string) => rows.find((r) => r.description === d)!;
  assert.equal(by("CIRCUIT BREAKER").kind, "skip");
  assert.match(by("CIRCUIT BREAKER").reason, /ONE-LINE/);
  assert.equal(by("DETAIL CALLOUT").kind, "skip");
  assert.equal(by("W INDICATES WEATHERPROOF").kind, "skip");
});

test("text outside the boxed region is ignored; an empty box reads nothing", () => {
  const { spans, segs } = legend();
  assert.ok(readLegend(spans, segs, [[0, 0], [700, 300]]).length >= 3);
  assert.deepEqual(readLegend(spans, segs, [[2000, 2000], [2100, 2100]]), []);
  assert.deepEqual(readLegend([], [], [[0, 0], [10, 10]]), []);
});

test("lines join on one baseline; a wide gap starts a new cell", () => {
  const ls = spansToLines([span("DUPLEX", 0, 10), span("RECEPTACLE", 40, 10), span("AFF", 400, 10)]);
  assert.deepEqual(ls.map((l) => l.text), ["DUPLEX RECEPTACLE", "AFF"]);
});

test("item tags and sheet disciplines", () => {
  assert.equal(tagFromDescription("DUPLEX RECEPTACLE, 120V"), "DUPLEX RECEPTACLE 120V");
  assert.equal(tagFromDescription("DUPLEX RECEPTACLE (E INDICATES EXISTING)", "Emergency"), "DUPLEX RECEPTACLE EMER");
  assert.ok(tagFromDescription("A VERY LONG DESCRIPTION OF A SPECIAL PURPOSE OUTLET THAT GOES ON").length <= 28);
  assert.equal(disciplineOf("E101"), "E");
  assert.equal(disciplineOf("EP212.05"), "E");
  assert.equal(disciplineOf("FA-201"), "FA");
  assert.equal(disciplineOf("T201"), "T");
  assert.equal(disciplineOf("PRJ01-E-E-142-4"), "E");
  assert.equal(disciplineOf(""), null);
});
