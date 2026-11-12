import { test } from "node:test";
import assert from "node:assert/strict";
import { conditionTotals, totalsToCsv } from "../src/lib/totals.js";
import {
  racewayName, racewayLabel, racewayProblem, racewayTemplate, racewayColorIndex,
  RACEWAY_TYPES, TRADE_SIZES, WIRE_SIZES, MOUNTINGS, MAX_CONDUCTORS, type RacewaySpec,
} from "../src/lib/raceway.js";

const lin = (id: string, lf: number) => ({ condition_id: id, measure_role: "linear", computed: { perimeter_lf: lf } });
const spec = (over: Partial<RacewaySpec> = {}): RacewaySpec => ({ type: "EMT", size: "3/4", count: 3, wire: "10", mount: "CONC", ...over });
// a template becomes a condition the way the canvas instantiates it: id + multiplier 1
const asCondition = (t: ReturnType<typeof racewayTemplate>) => ({ id: "c", multiplier: 1, ...t, materials: t.materials.map((m, i) => ({ id: `m${i}`, ...m })) });

test("raceway: names read like an estimating-system item", () => {
  assert.equal(racewayName(spec()), "3/4 EMT 3-#10 CONC");
  assert.equal(racewayName(spec({ count: 4 })), "3/4 EMT 4-#10 CONC");
  assert.equal(racewayName(spec({ size: "1-1/4", wire: "1/0", count: 4, mount: "T-ROD" })), "1-1/4 EMT 4-#1/0 T-ROD");
  assert.equal(racewayName(spec({ size: "3", wire: "250", count: 3, mount: "STRUT" })), "3 EMT 3-250K STRUT");
  assert.equal(racewayName(spec({ ground: "12" })), "3/4 EMT 3-#10 +#12G CONC");
  assert.equal(racewayName(spec({ count: 0 })), "3/4 EMT EMPTY CONC");
  assert.equal(racewayName(spec({ type: "FMC", size: "1/2", mount: "WOOD" })), "1/2 FMC 3-#10 WOOD");
  assert.match(racewayLabel(spec({ ground: "12" })), /3\/4" EMT, 3 #10 \+ #12 ground, on concrete/);
});

test("raceway: every picker choice builds, and bad specs are refused with a reason", () => {
  for (const t of RACEWAY_TYPES) for (const s of TRADE_SIZES) for (const w of WIRE_SIZES) for (const m of MOUNTINGS) {
    assert.equal(racewayProblem({ type: t.id, size: s, count: 3, wire: w, mount: m.id }), null);
  }
  assert.match(racewayProblem(null)!, /No raceway/);
  assert.match(racewayProblem(spec({ type: "XYZ" }))!, /type/);
  assert.match(racewayProblem(spec({ size: "7" }))!, /trade size/);
  assert.match(racewayProblem(spec({ mount: "GLASS" }))!, /mounts to/);
  assert.match(racewayProblem(spec({ count: 2.5 }))!, /whole number/);
  assert.match(racewayProblem(spec({ count: -1 }))!, /whole number/);
  assert.match(racewayProblem(spec({ count: MAX_CONDUCTORS + 1 }))!, /whole number/);
  assert.match(racewayProblem(spec({ wire: "9" }))!, /wire size/);
  assert.match(racewayProblem(spec({ ground: "9" }))!, /ground wire size/);
  assert.match(racewayProblem(spec({ count: 0, ground: "12" }))!, /ground needs/);
  assert.equal(racewayProblem(spec({ count: 0 })), null);   // an empty raceway needs no wire size
  assert.throws(() => racewayTemplate(spec({ size: "7" }), "#000"), /trade size/);
});

test("raceway: conduit footage stays true — the conductor count rides the wire line, not the condition ×N", () => {
  const tpl = racewayTemplate(spec({ count: 7, wire: "12", ground: "12" }), "#2563eb");
  assert.ok(!("multiplier" in tpl), "a template never carries a condition multiplier");
  const [r] = conditionTotals([asCondition(tpl)], [lin("c", 100)]);
  assert.equal(r.lf, 100, "the raceway is 100 LF, not 700");
  assert.equal(r.lf_net, 105);   // 5% waste
  const by = Object.fromEntries(r.materials.map((m: any) => [m.name, m]));
  assert.equal(by["3/4 EMT (10 ft)"].qty, 10, "100 LF of 10 ft sticks");
  assert.equal(by["THHN #12"].qty, 700, "7 conductors × 100 LF");
  assert.equal(by["THHN #12 (ground)"].qty, 100);
  assert.equal(by["THHN #12"].mult, 7);
  assert.equal(by["3/4 EMT (10 ft)"].mult, undefined, "a plain line reports no mult");
});

test("raceway: sticks round up; flex is bought by the foot; empty has no wire", () => {
  const [r] = conditionTotals([asCondition(racewayTemplate(spec({ count: 0 }), "#000"))], [lin("c", 101)]);
  assert.deepEqual(r.materials.map((m: any) => [m.name, m.qty]), [["3/4 EMT (10 ft)", 11]]);
  const [f] = conditionTotals([asCondition(racewayTemplate(spec({ type: "FMC", size: "1/2" }), "#000"))], [lin("c", 25)]);
  assert.deepEqual(f.materials.map((m: any) => [m.name, m.unit, m.qty]), [["1/2 FMC", "lf", 25], ["THHN #10", "lf", 75]]);
});

test("raceway: a run on the condition ×N still scales everything — the old way is unchanged", () => {
  const c = { ...asCondition(racewayTemplate(spec(), "#000")), multiplier: 2 };
  const [r] = conditionTotals([c], [lin("c", 100)]);
  assert.equal(r.lf, 200);
  assert.equal(r.materials.find((m: any) => m.name === "THHN #10").qty, 600);
});

test("materials: a line's own mult scales that line only; absent or ≤ 0 means 1", () => {
  const conds = [{ id: "c", finish_tag: "X", multiplier: 1, materials: [
    { id: "a", name: "plain", per: 10, basis: "linear", unit: "ea" },
    { id: "b", name: "wire", per: 10, mult: 3, basis: "linear", unit: "lf" },
    { id: "z", name: "zero", per: 10, mult: 0, basis: "linear", unit: "lf" },
    { id: "n", name: "neg", per: 10, mult: -2, basis: "linear", unit: "lf" },
    { id: "e", name: "each", per: 1, mult: 2, basis: "count", unit: "ea" },
  ] }];
  const shapes = [lin("c", 55), { condition_id: "c", measure_role: "count", computed: { count: 4 } }];
  const [r] = conditionTotals(conds, shapes);
  const q = Object.fromEntries(r.materials.map((m: any) => [m.name, m.qty]));
  assert.deepEqual(q, { plain: 6, wire: 17, zero: 6, neg: 6, each: 8 });
  assert.equal(r.materials.find((m: any) => m.name === "wire").basis_qty, 165, "basis_qty is what the row divides, so qty = basis_qty ÷ per still holds");
});

test("raceway: an exported buy list says 3 lf per LF, not 1", () => {
  const rows = conditionTotals([asCondition(racewayTemplate(spec(), "#000"))], [lin("c", 100)]);
  const csv = totalsToCsv(rows);
  assert.match(csv, /THHN #10,300,lf,3 lf \/ 1 LF/);
  assert.match(csv, /3\/4 EMT \(10 ft\),10,ea,1 ea \/ 10 LF/);
});

test("raceway: a configuration always lands on the same palette slot", () => {
  const n = racewayName(spec());
  assert.equal(racewayColorIndex(n, 10), racewayColorIndex(n, 10));
  for (const s of TRADE_SIZES) assert.ok(racewayColorIndex(racewayName(spec({ size: s })), 10) < 10);
  assert.equal(racewayColorIndex("x", 0), 0);
});
