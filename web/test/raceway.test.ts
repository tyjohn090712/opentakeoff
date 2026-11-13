import { test } from "node:test";
import assert from "node:assert/strict";
import { conditionTotals, totalsToCsv } from "../src/lib/totals.js";
import {
  racewayName, racewayLabel, racewayProblem, racewayTemplate, racewayColorIndex,
  RACEWAY_TYPES, TRADE_SIZES, WIRE_SIZES, MC_WIRES, MC_COUNTS, MOUNTINGS, MC_MOUNTINGS, mountingsFor,
  MAX_CONDUCTORS, WIRE_WASTE_PCT, type RacewaySpec,
} from "../src/lib/raceway.js";

const lin = (id: string, lf: number) => ({ condition_id: id, measure_role: "linear", computed: { perimeter_lf: lf } });
const spec = (over: Partial<RacewaySpec> = {}): RacewaySpec => ({ type: "EMT", size: "3/4", count: 3, wire: "10", mount: "CONC", ...over });
// a template becomes a condition the way the canvas instantiates it: id + multiplier 1
const mc = (over: Partial<RacewaySpec> = {}): RacewaySpec => ({ type: "MC", wire: "12", count: 2, mount: "WOOD", ...over });
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
  assert.equal(racewayName(mc()), "12/2 MC WOOD");
  assert.equal(racewayName(mc({ wire: "10", count: 3, mount: "DROP-WIRE" })), "10/3 MC DROP-WIRE");
  assert.equal(racewayLabel(mc({ mount: "DROP-WIRE" })), "12/2 MC cable, on drop wire");
});

test("raceway: every picker choice builds, and bad specs are refused with a reason", () => {
  for (const t of RACEWAY_TYPES) for (const s of TRADE_SIZES) for (const w of WIRE_SIZES) for (const m of MOUNTINGS) {
    assert.equal(racewayProblem({ type: t.id, size: s, count: 3, wire: w, mount: m.id }), null);
  }
  for (const w of MC_WIRES) for (const n of MC_COUNTS) for (const m of MC_MOUNTINGS) {
    assert.equal(racewayProblem(mc({ wire: w, count: n, mount: m.id })), null);
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

test("raceway: MC takes the five conduit supports plus a drop wire; conduit never gets one", () => {
  assert.deepEqual(MC_MOUNTINGS.map((m) => m.id), ["CONC", "STEEL", "WOOD", "T-ROD", "STRUT", "DROP-WIRE"]);
  assert.deepEqual(mountingsFor("EMT").map((m) => m.id), ["CONC", "STEEL", "WOOD", "T-ROD", "STRUT"]);
  assert.match(racewayProblem(spec({ mount: "DROP-WIRE" }))!, /mounts to/);
  assert.equal(racewayProblem(mc({ mount: "DROP-WIRE" })), null);
});

test("raceway: an MC cable is 2–5 conductors of a branch-circuit size", () => {
  assert.match(racewayProblem(mc({ count: 1 }))!, /2 to 5/);
  assert.match(racewayProblem(mc({ count: 6 }))!, /2 to 5/);
  assert.match(racewayProblem(mc({ count: 2.5 }))!, /2 to 5/);
  assert.match(racewayProblem(mc({ wire: "1/0" }))!, /cable size/);
  assert.match(racewayProblem(mc({ wire: "9" }))!, /cable size/);
  assert.match(racewayProblem(mc({ mount: "GLASS" }))!, /mounts to/);
  assert.throws(() => racewayTemplate(mc({ count: 1 }), "#000"), /2 to 5/);
});

test("raceway: conduit footage stays true — the conductor count rides the wire line, not the condition ×N", () => {
  const tpl = racewayTemplate(spec({ count: 7, wire: "12", ground: "12" }), "#2563eb");
  assert.ok(!("multiplier" in tpl), "a template never carries a condition multiplier");
  const [r] = conditionTotals([asCondition(tpl)], [lin("c", 100)]);
  assert.equal(r.lf, 100, "the raceway is 100 LF, not 700");
  assert.equal(r.lf_net, 105);   // conduit: 5% on the condition
  const by = Object.fromEntries(r.materials.map((m: any) => [m.name, m]));
  assert.equal(by["3/4 EMT (10 ft)"].qty, 10, "100 LF of 10 ft sticks");
  assert.equal(by["THHN #12"].qty, 770, "7 conductors × 100 LF, +10% waste");
  assert.equal(by["THHN #12 (ground)"].qty, 110);
  assert.equal(by["THHN #12"].mult, 7);
  assert.equal(by["3/4 EMT (10 ft)"].mult, undefined, "a plain line reports no mult");
  assert.equal(by["3/4 EMT (10 ft)"].waste_pct, undefined, "and no waste");
});

test("raceway: every wire line carries 10% waste, in any configuration", () => {
  assert.equal(WIRE_WASTE_PCT, 10);
  for (const s of [spec(), spec({ ground: "12" }), spec({ type: "FMC", size: "1/2" }), spec({ size: "2", wire: "250", count: 4 })]) {
    const wires = racewayTemplate(s, "#000").materials.filter((m) => m.kind === "conductor");
    assert.ok(wires.length >= 1);
    for (const w of wires) assert.equal(w.waste_pct, 10, `${racewayName(s)} · ${w.name}`);
  }
  assert.deepEqual(racewayTemplate(spec({ count: 0 }), "#000").materials.filter((m) => m.kind === "conductor"), [], "an empty raceway has no wire");
});

test("raceway: MC cable reads its LF with 10% waste, on the cable line and the condition", () => {
  const tpl = racewayTemplate(mc({ wire: "12", count: 3, mount: "DROP-WIRE" }), "#0d9488");
  assert.equal(tpl.finish_tag, "12/3 MC DROP-WIRE");
  assert.equal(tpl.waste_pct, 10);
  assert.ok(!("multiplier" in tpl));
  const [r] = conditionTotals([asCondition(tpl)], [lin("c", 100)]);
  assert.equal(r.lf, 100);
  assert.equal(r.lf_net, 110);
  assert.deepEqual(r.materials.map((m: any) => [m.name, m.unit, m.qty]), [["12/3 MC cable", "lf", 110]]);
  assert.equal(r.materials[0].waste_pct, 10);
});

test("raceway: sticks round up; flex is bought by the foot; empty has no wire", () => {
  const [r] = conditionTotals([asCondition(racewayTemplate(spec({ count: 0 }), "#000"))], [lin("c", 101)]);
  assert.deepEqual(r.materials.map((m: any) => [m.name, m.qty]), [["3/4 EMT (10 ft)", 11]]);
  const [f] = conditionTotals([asCondition(racewayTemplate(spec({ type: "FMC", size: "1/2" }), "#000"))], [lin("c", 25)]);
  assert.deepEqual(f.materials.map((m: any) => [m.name, m.unit, m.qty]), [["1/2 FMC", "lf", 25], ["THHN #10", "lf", 83]], "3 × 25 LF × 1.1 = 82.5, rounded up");
});

test("raceway: a run on the condition ×N still scales everything — the old way is unchanged", () => {
  const c = { ...asCondition(racewayTemplate(spec(), "#000")), multiplier: 2 };
  const [r] = conditionTotals([c], [lin("c", 100)]);
  assert.equal(r.lf, 200);
  assert.equal(r.materials.find((m: any) => m.name === "THHN #10").qty, 660, "2 × 100 LF × 3 conductors, +10%");
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

test("materials: a line's own waste_pct is added to that line only, before rounding", () => {
  const conds = [{ id: "c", finish_tag: "X", multiplier: 1, waste_pct: 50, materials: [
    { id: "a", name: "plain", per: 10, basis: "linear", unit: "ea" },
    { id: "w", name: "wasted", per: 10, waste_pct: 10, basis: "linear", unit: "ea" },
    { id: "m", name: "both", per: 1, mult: 3, waste_pct: 10, basis: "linear", unit: "lf" },
    { id: "n", name: "neg", per: 10, waste_pct: -20, basis: "linear", unit: "ea" },
    { id: "r", name: "unrounded", per: 10, waste_pct: 10, round: false, basis: "linear", unit: "ea" },
  ] }];
  const [r] = conditionTotals(conds, [lin("c", 55)]);
  const by = Object.fromEntries(r.materials.map((m: any) => [m.name, m]));
  assert.equal(by.plain.qty, 6, "the condition's own 50% waste never reaches the buy list");
  assert.equal(by.wasted.qty, 7, "55 × 1.1 = 60.5 ÷ 10 = 6.05, rounded up");
  assert.equal(by.both.qty, 182, "55 × 3 × 1.1 = 181.5");
  assert.equal(by.neg.qty, 6, "a negative allowance is no allowance");
  assert.equal(by.unrounded.qty, 6.05);
  assert.equal(by.wasted.basis_qty, 60.5, "basis_qty is what the row divides");
  assert.equal(by.wasted.waste_pct, 10);
  assert.equal(by.plain.waste_pct, undefined);
});

test("raceway: an exported buy list says 3 lf per LF and names the waste", () => {
  const rows = conditionTotals([asCondition(racewayTemplate(spec(), "#000"))], [lin("c", 100)]);
  const csv = totalsToCsv(rows);
  assert.match(csv, /THHN #10,330,lf,3 lf \/ 1 LF \+10% waste/);
  assert.match(csv, /3\/4 EMT \(10 ft\),10,ea,1 ea \/ 10 LF,/);
});

test("raceway: a configuration always lands on the same palette slot", () => {
  const n = racewayName(spec());
  assert.equal(racewayColorIndex(n, 10), racewayColorIndex(n, 10));
  for (const s of TRADE_SIZES) assert.ok(racewayColorIndex(racewayName(spec({ size: s })), 10) < 10);
  assert.equal(racewayColorIndex("x", 0), 0);
});
