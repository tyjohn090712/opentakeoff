// Linear-run points (electrical fork): counted / uncounted points, adders and
// disconnected segments on a traced run. Invariants:
//   - every click counts unless Shift made it uncounted; bow points never count;
//   - a G jump is never run length, and splits the run into segments;
//   - a run's EA (counted points) and adder LF ride the shape, so they reach
//     the condition totals and survive any later recompute of perimeter_lf;
//   - the double-click that finishes a run never counts its end twice;
//   - a one-point segment loses nothing: its marks ride a neighbour.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runCountedPoints, runAdderLf, runTotalLf, draftRunLength, draftRunTally, dedupeDraft,
  splitDraftRun, buildRun, strandedMarks, runMarkPositions, adderTag, conditionAdderFt, DEFAULT_ADDER_FT,
} from "../src/lib/runPoints.js";
import { conditionTotals, sheetTotals } from "../src/lib/totals.js";
import { measurementBreakdown } from "../src/lib/measurementBreakdown.js";
import { shapesDetail } from "../src/lib/shapesExport.js";

const norm = ([x, y]: number[]) => [x / 100, y / 100];

test("draft length skips G jumps; tally counts every non-bow click but Shift-clicks", () => {
  const pts = [[0, 0], [10, 0], [50, 0], [50, 10]];
  const meta = [{}, { u: true }, { gap: true, add: [10] }, { add: [5, 5] }];
  assert.equal(draftRunLength(pts, meta), 20);           // 10 + (jump 40 skipped) + 10
  assert.equal(draftRunLength(pts), 60);                 // no meta = one connected run
  assert.deepEqual(draftRunTally(meta, []), { counted: 3, adderFt: 20 });
  assert.deepEqual(draftRunTally([{}, {}, {}], [false, true, false]), { counted: 2, adderFt: 0 });   // a bow is not a place on the run
});

test("dedupeDraft merges the finishing double-click, keeping the first click's state and every adder", () => {
  const d = dedupeDraft([[0, 0], [10, 0], [10, 0.2]], [false, false, false], [{}, { u: true, add: [10] }, { add: [5] }]);
  assert.equal(d.pts.length, 2);
  assert.deepEqual(d.meta[1], { u: true, add: [10, 5] });
  // a jump to the same spot is a deliberate new segment, not a duplicate
  assert.equal(dedupeDraft([[0, 0], [0, 0]], [], [{}, { gap: true }]).pts.length, 2);
});

test("splitDraftRun breaks at jumps; buildRun maps marks onto the stored vertices", () => {
  const pieces = splitDraftRun([[0, 0], [10, 0], [50, 0], [60, 0]], [], [{}, { u: true }, { gap: true }, { add: [10] }]);
  assert.equal(pieces.length, 2);
  assert.deepEqual(pieces[1].pts, [[50, 0], [60, 0]]);
  const r0 = buildRun(pieces[0], pieces[0].pts, norm);
  assert.deepEqual(r0, { n: 2, counted: [{ i: 0, at: [0, 0] }], adders: [] });
  const r1 = buildRun(pieces[1], pieces[1].pts, norm, { counted: [[30, 0]], adders: [{ at: [30, 0], ft: 4 }] });
  assert.equal(r1!.counted.length, 3);
  assert.deepEqual(r1!.counted[2], { i: -1, at: [0.3, 0] });   // carried in at its own position
  assert.deepEqual(r1!.adders.map((a) => a.ft), [10, 4]);
  assert.equal(buildRun({ pts: [[0, 0], [1, 0]], curve: [false, false], meta: [{ u: true }, { u: true }] }, [[0, 0], [1, 0]], norm), null);
});

test("a corner that a flattened curve no longer holds falls back to its position", () => {
  const piece = { pts: [[0, 0], [5, 5], [10, 0]], curve: [false, true, false], meta: [{}, {}, {}] };
  const drawn = [[0, 0], [2, 3], [5, 4], [8, 3], [10, 0]];
  const run = buildRun(piece, drawn, norm)!;
  assert.deepEqual(run.counted.map((c) => c.i), [0, 4]);   // the bow is not counted; the ends map to their vertices
  assert.deepEqual(strandedMarks({ pts: [[3, 3]], curve: [false], meta: [{ add: [10] }] }), { counted: [[3, 3]], adders: [{ at: [3, 3], ft: 10 }] });
});

const run = (lf: number, run: unknown, extra: Record<string, unknown> = {}) => ({
  id: `s${Math.random()}`, sheet_id: "a.pdf#1", condition_id: "c1", measure_role: "linear",
  verts_norm: [[0, 0], [0.1, 0], [0.2, 0]], computed: { perimeter_lf: lf, area_sf: 0 }, run, ...extra,
});

test("counted points become EA and adders become LF in the condition totals (and the buy list)", () => {
  const s1 = run(100, { n: 3, counted: [{ i: 0, at: [0, 0] }, { i: 2, at: [0.2, 0] }], adders: [{ i: 2, at: [0.2, 0], ft: 10 }, { i: 2, at: [0.2, 0], ft: 10 }] });
  const s2 = run(50, undefined);   // a run drawn before counted points existed
  assert.equal(runCountedPoints(s1), 2); assert.equal(runAdderLf(s1), 20); assert.equal(runTotalLf(s1), 120);
  assert.equal(runCountedPoints(s2), 0); assert.equal(runTotalLf(s2), 50);
  const cond = { id: "c1", finish_tag: "MC 12-2", multiplier: 1, waste_pct: 0, materials: [
    { name: "MC connector", per: 1, basis: "count", unit: "ea", mult: 2 },
    { name: "MC 12/2", per: 1, basis: "linear", unit: "ft", waste_pct: 10 },
  ] };
  const [row] = conditionTotals([cond], [s1, s2]);
  assert.equal(row.lf, 170);
  assert.equal(row.ea, 2);
  assert.equal(row.materials[0].qty, 4);     // 2 points × 2 connectors
  assert.equal(row.materials[1].qty, 187);   // 170 LF + 10%
  const [sheet] = sheetTotals([cond], [s1, s2]);
  assert.equal(sheet.rows[0].lf, 170);
  assert.equal(sheet.rows[0].ea, 2);
});

test("the quantities ride the shape: a recomputed perimeter_lf never drops points or adders", () => {
  const s = run(100, { n: 3, counted: [{ i: 0, at: [0, 0] }], adders: [{ i: 0, at: [0, 0], ft: 10 }] });
  const edited = { ...s, verts_norm: [[0, 0], [0.3, 0]], computed: { perimeter_lf: 80, area_sf: 0 } };   // a vertex deleted, length recomputed
  assert.equal(runTotalLf(edited), 90);
  assert.equal(runCountedPoints(edited), 1);
  assert.equal(measurementBreakdown([edited], "c1", {})[0].lf, 90);
  const [row] = shapesDetail([{ id: "c1", finish_tag: "MC 12-2" }], [edited]);
  assert.equal(row.lf, 90); assert.equal(row.ea, 1);
});

test("marks sit on their vertex while the vertex count holds, then on the nearest vertex", () => {
  const s = run(100, { n: 3, counted: [{ i: 2, at: [0.2, 0] }, { i: -1, at: [0.5, 0.5] }], adders: [{ i: 1, at: [0.1, 0], ft: 10 }] });
  const moved = { ...s, verts_norm: [[0, 0], [0.1, 0.4], [0.2, 0]] };
  assert.deepEqual(runMarkPositions(moved).counted, [[0.2, 0], [0.5, 0.5]]);
  assert.deepEqual(runMarkPositions(moved).adders, [{ at: [0.1, 0.4], ft: 10 }]);   // follows its dragged vertex
  const fewer = { ...s, verts_norm: [[0, 0], [0.19, 0]] };
  assert.deepEqual(runMarkPositions(fewer).counted[0], [0.19, 0]);
});

test("adder length: the item's own, else 10 ft; the tag reads in feet", () => {
  assert.equal(conditionAdderFt({ adder_ft: 6 }), 6);
  assert.equal(conditionAdderFt({}), DEFAULT_ADDER_FT);
  assert.equal(conditionAdderFt({ adder_ft: 0 }), DEFAULT_ADDER_FT);
  assert.equal(conditionAdderFt(null), 10);
  assert.equal(adderTag(10), "+10′");
  assert.equal(adderTag(2.5), "+2.5′");
});
