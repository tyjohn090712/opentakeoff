// Breakout areas (electrical fork): autocount splits a count by the named
// region each item sits in, and won't run until areas exist or the estimator
// says the job has none.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeBreakoutAreas, areaAt, areasOn, autocountGate, areaTallyText } from "../src/lib/breakouts.js";

const sq = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const A = { id: "a", name: "Area A", sheet_id: "e.pdf#1", verts_norm: sq(0, 0, 0.5, 1) };
const B = { id: "b", name: "Area B", sheet_id: "e.pdf#1", verts_norm: sq(0.5, 0, 1, 1) };
const C = { id: "c", name: "Area C", sheet_id: "e.pdf#2", verts_norm: sq(0, 0, 1, 1) };

test("an item takes the area it sits in, on its own sheet only", () => {
  assert.equal(areaAt([A, B, C], "e.pdf#1", [0.25, 0.5])?.name, "Area A");
  assert.equal(areaAt([A, B, C], "e.pdf#1", [0.75, 0.5])?.name, "Area B");
  assert.equal(areaAt([A, B], "e.pdf#2", [0.25, 0.5]), null);
  assert.equal(areaAt([A], "e.pdf#1", [0.9, 0.5]), null);
  assert.deepEqual(areasOn([A, B, C], "e.pdf#2").map((a) => a.name), ["Area C"]);
});

test("autocount is blocked until areas are drawn or 'no breakout areas' is ticked", () => {
  assert.equal(autocountGate({ areas: [], noBreakouts: false }).ok, false);
  assert.equal(autocountGate({ areas: [], noBreakouts: true }).ok, true);
  assert.equal(autocountGate({ areas: [], noBreakouts: true, split: "areas" }).ok, false);
  assert.equal(autocountGate({ areas: [C], sheetId: "e.pdf#1", scope: "sheet", split: "areas" }).ok, false);   // none on this sheet
  assert.equal(autocountGate({ areas: [C], sheetId: "e.pdf#1", scope: "all", split: "areas" }).ok, true);
  assert.equal(autocountGate({ areas: [A], sheetId: "e.pdf#1", scope: "sheet", split: "one" }).ok, true);
});

test("hydrate drops malformed areas; the tally reads area by area, outside last", () => {
  const got = sanitizeBreakoutAreas([A, { name: "", sheet_id: "x", verts_norm: sq(0, 0, 1, 1) }, { name: "Q", sheet_id: "x", verts_norm: [[0, 0], [1, 1]] }, null, "x"]);
  assert.deepEqual(got.map((a) => a.name), ["Area A"]);
  assert.deepEqual(sanitizeBreakoutAreas("nope"), []);
  assert.equal(areaTallyText(["Area B", "", "Area A", "Area B"]), "Area A 1 · Area B 2 · outside any area 1");
});

import { collapseFinds } from "../src/lib/sweepReview.js";

test("one symbol, one count: two readings at one spot collapse to the best; a ? on a find or the seed goes", () => {
  const m = (x: number, y: number, score: number, rotation = 0) => ({ at: [x, y], score, rotation });
  const got = collapseFinds(
    [m(100, 100, 0.8, 180), m(101, 100, 0.95, 0), m(300, 100, 0.9), m(500, 500, 0.9)],
    [{ at: [301, 101], score: 0.7 }, { at: [700, 700], score: 0.7 }, { at: [50, 52], score: 0.7 }],
    6, [50, 50],
  );
  assert.deepEqual(got.matches.map((x) => [x.at[0], x.score, x.readings]), [[101, 0.95, 2], [300, 0.9, 1], [500, 0.9, 1]]);
  assert.deepEqual(got.questions.map((q) => q.at[0]), [700]);
  assert.deepEqual(collapseFinds([m(50, 50, 0.99)], [], 6, [50, 50]).matches, []);   // the seed's own spot isn't counted twice
});
