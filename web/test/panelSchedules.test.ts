// Imported panel schedules — the `panel_schedules` payload key. Invariants:
//   - hydrate is defensive: non-arrays → [], corrupt entries dropped, ids
//     de-duplicated, names upper-cased, region kept only when it's 4 numbers;
//   - a breaker row can't smuggle a bad size into the counts: load/spare with
//     a non-standard trip or a pole count outside 1–3 hydrates as withheld;
//   - the all-panels roll-up sums breakers by size across panels;
//   - the CSV lists breakers per panel, a SPACE row, and every unresolved row.
// All data here is synthetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizePanelSchedules, allPanelsTotals, panelSchedulesToCsv, breakerSummaryText } from "../src/lib/panelSchedules.js";

const ckt = (ckts: number[], kind: string, trip: number | null, poles: number | null, description = "") => ({ side: "L", ckts, description, trip, poles, kind });

test("hydrate: junk in, clean shape out", () => {
  assert.deepEqual(sanitizePanelSchedules(null), []);
  assert.deepEqual(sanitizePanelSchedules({ a: 1 }), []);
  const out = sanitizePanelSchedules([
    null, 7, [],
    { id: "p1", name: "lp-1", sheet_id: "s1", region: [0.1, 0.2, 0.5, 0.6], circuits: [ckt([1], "load", 20, 1, "LTG")], info: { volts: "208Y/120V", bogus: "x", bus: 5 } },
    { id: "p1", name: "LP-2", circuits: [ckt([1], "load", 20, 1)], region: [0, "a", 1, 1] },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].name, "LP-1");
  assert.deepEqual(out[0].info, { volts: "208Y/120V" });
  assert.deepEqual(out[0].region, [0.1, 0.2, 0.5, 0.6]);
  assert.notEqual(out[1].id, "p1", "duplicate id re-minted");
  assert.equal(out[1].region, undefined, "malformed region dropped");
});

test("hydrate: a breaker row with a bad size or pole count becomes withheld", () => {
  const [p] = sanitizePanelSchedules([{ name: "X", circuits: [
    ckt([1], "load", 33, 1, "ODD"), ckt([2], "spare", 20, 4, "SPARE"), ckt([3], "space", 20, 1), ckt([4], "mystery", 20, 1),
  ] }]);
  assert.deepEqual(p.circuits.map((c: { kind: string }) => c.kind), ["withheld", "withheld", "space", "withheld"]);
  assert.equal(p.circuits[2].trip, null, "a space carries no breaker");
  assert.ok(p.circuits[0].reason);
});

test("roll-up across panels, and the CSV for the estimate", () => {
  const panels = sanitizePanelSchedules([
    { name: "LP-1", sheet_id: "s1", info: { volts: "208Y/120V" }, circuits: [ckt([1], "load", 20, 1, "LTG"), ckt([2], "spare", 20, 1, "SPARE"), ckt([3, 5], "load", 30, 2, "EF-1"), ckt([4], "space", null, null)] },
    { name: "LP-2", sheet_id: "s2", circuits: [ckt([1], "load", 20, 1, "REC"), ckt([2], "withheld", null, null, "AHU-1")] },
  ]);
  const t = allPanelsTotals(panels);
  assert.equal(breakerSummaryText(t.breakers), "20A 1P ×3 · 30A 2P ×1");
  assert.equal(t.breakers[0].spares, 1);
  assert.equal(t.spacePositions, 1);
  assert.equal(t.withheld, 1);
  const csv = panelSchedulesToCsv(panels, (id: string) => `Sheet ${id}`);
  const lines = csv.trim().split("\n");
  assert.match(lines[0], /^Panel,Sheet,Volts/);
  assert.ok(lines.some((l) => l.startsWith("LP-1,Sheet s1,208Y/120V,,,,BKR 20A 1P,1,20,2,1,")));
  assert.ok(lines.some((l) => l.startsWith("LP-1,Sheet s1,208Y/120V,,,,SPACE,,,1,")));
  assert.ok(lines.some((l) => l.startsWith("LP-2,") && l.includes("UNRESOLVED") && l.includes("AHU-1")));
});
