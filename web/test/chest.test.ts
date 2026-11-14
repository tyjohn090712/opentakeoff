// Tool chest (electrical fork): the condition-template Library as an organized,
// searchable chest whose items carry their labels and arm the right tool.
// Invariants:
//   - a library saved BEFORE the chest existed (no seed flag) seeds new projects
//     exactly as it did; chest items (seed:false) never flood a new project;
//   - none starred → the built-in defaults, never an empty workspace;
//   - labels travel by column NAME, creating the column / value when missing;
//   - a malformed chest field is dropped on load, never thrown on;
//   - the starter catalog is internally sound and agrees with a fresh project.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHEST_ORDER, OTHER, EST_CODE_COLUMN, templateCategory, seedsNewProjects, measureTool, seedTemplates,
  chestGroups, attrsByName, resolveTemplateAttrs, inferMeasure, templateFromCondition,
} from "../src/lib/chest.js";
import { deviceCatalog, missingStarters } from "../src/lib/deviceCatalog.js";
import { sanitizeTemplates } from "../src/lib/templates.js";
import { ELECTRICAL_DEFAULTS } from "../src/lib/canvasConstants.js";
import { seedConditions, seedWorkspace, instantiateTemplate } from "../src/lib/canvasUtil.js";
import { HATCHES } from "../src/components/hatches.jsx";
import { racewayTemplate } from "../src/lib/raceway.js";

const t = (tag: string, extra: Record<string, unknown> = {}) => ({ finish_tag: tag, color: "#000", hatch: "solid", materials: [], ...extra });
let n = 0;
const mint = () => `col-${++n}`;

test("chest: defaults — no category is Other, no flag seeds, no measure arms nothing", () => {
  assert.equal(templateCategory(t("A")), OTHER);
  assert.equal(templateCategory(t("A", { category: "  Fire alarm " })), "Fire alarm");
  assert.equal(templateCategory(t("A", { category: "   " })), OTHER);
  assert.equal(seedsNewProjects(t("A")), true);
  assert.equal(seedsNewProjects(t("A", { seed: true })), true);
  assert.equal(seedsNewProjects(t("A", { seed: false })), false);
  assert.equal(measureTool(t("A")), null);
  assert.equal(measureTool(t("A", { measure: "linear" })), "linear");
  assert.equal(measureTool(t("A", { measure: "volume" })), null);
});

test("chest: a library saved before the chest seeds exactly as it did", () => {
  const legacy = [t("CPT-1"), t("TR-1")];
  assert.deepEqual(seedTemplates(legacy, ELECTRICAL_DEFAULTS), legacy);
  assert.deepEqual(seedConditions(legacy).map((c: any) => c.finish_tag), ["CPT-1", "TR-1"]);
});

test("chest: chest items don't seed new projects; starred ones do; none starred → the built-in defaults", () => {
  const lib = [t("A", { seed: false }), t("B", { seed: true }), t("C"), t("D", { seed: false })];
  assert.deepEqual(seedTemplates(lib, ELECTRICAL_DEFAULTS).map((x: any) => x.finish_tag), ["B", "C"]);
  const onlyChest = [t("A", { seed: false }), t("B", { seed: false })];
  assert.equal(seedTemplates(onlyChest, ELECTRICAL_DEFAULTS), ELECTRICAL_DEFAULTS, "a chest with nothing starred starts a project on the defaults");
  assert.equal(seedTemplates([], ELECTRICAL_DEFAULTS), ELECTRICAL_DEFAULTS);
  assert.equal(seedTemplates(null as any, ELECTRICAL_DEFAULTS), ELECTRICAL_DEFAULTS);
  assert.deepEqual(seedConditions(onlyChest).map((c: any) => c.finish_tag), ELECTRICAL_DEFAULTS.map((d: any) => d.finish_tag));
});

test("chest: groups read in a set order, items sort naturally, and idx points into the full library", () => {
  const lib = [
    t("LT-2X4", { category: "Lighting" }), t("FA-SS-W", { category: "Fire alarm" }), t("Z-1", { category: "Zebra" }),
    t("REC-20", { category: "Receptacles" }), t("MISC"), t("REC-5", { category: "Receptacles" }), t("A-1", { category: "Aardvark" }),
    t("REC-15", { category: "Receptacles" }),
  ];
  const g = chestGroups(lib);
  assert.deepEqual(g.map((x) => x.name), ["Receptacles", "Lighting", "Fire alarm", "Aardvark", "Zebra", OTHER]);
  assert.deepEqual(g[0].items.map((i: any) => i.t.finish_tag), ["REC-5", "REC-15", "REC-20"], "REC-5 before REC-15: numeric order");
  assert.deepEqual(g[0].items.map((i: any) => i.idx), [5, 7, 3], "idx addresses the unfiltered library");
  for (const name of CHEST_ORDER) assert.ok(typeof name === "string");
});

test("chest: search needs every word, across tag, group, description, labels and material names", () => {
  const lib = [
    t("FA-SS-W", { category: "Fire alarm", desc: "Speaker/strobe, wall mount", materials: [{ name: "Back box" }] }),
    t("FA-STROBE-C", { category: "Fire alarm", desc: "Strobe, ceiling mount" }),
    t("REC-20", { category: "Receptacles", attrs_by_name: { "Est. code": "26 27 26.10" }, materials: [{ name: "Single-gang device box" }] }),
  ];
  const tags = (q: string) => chestGroups(lib, q).flatMap((g: any) => g.items.map((i: any) => i.t.finish_tag));
  assert.deepEqual(tags(""), ["REC-20", "FA-SS-W", "FA-STROBE-C"], "groups in chest order");
  assert.deepEqual(tags("strobe"), ["FA-SS-W", "FA-STROBE-C"], "FA-SS-W is a speaker/STROBE by its description");
  assert.deepEqual(tags("speaker strobe"), ["FA-SS-W"]);
  assert.deepEqual(tags("STROBE ceiling"), ["FA-STROBE-C"], "case-insensitive, any order");
  assert.deepEqual(tags("26 27"), ["REC-20"], "label values are searchable");
  assert.deepEqual(tags("back box"), ["FA-SS-W"], "so are material names");
  assert.deepEqual(tags("fire alarm"), ["FA-SS-W", "FA-STROBE-C"], "and the group");
  assert.deepEqual(tags("nothing like this"), []);
});

test("chest: labels travel by column NAME — a missing column or value is created, an existing one reused", () => {
  const cols = [{ id: "c1", name: "CSI Division", values: ["26"] }];
  // nothing to map: same array back
  const none = resolveTemplateAttrs(cols, undefined, mint);
  assert.equal(none.columns, cols);
  assert.deepEqual(none.attrs, {});
  // an existing column (matched case-insensitively), a new value on it, and a column that doesn't exist yet
  const r = resolveTemplateAttrs(cols, { "csi division": "27", "Est. code": "26 27 26.10", "": "x", "Blank": "  " }, mint);
  assert.deepEqual(r.columns[0].values, ["26", "27"], "the value joined the existing column's list");
  const est = r.columns.find((c: any) => c.name === "Est. code")!;
  assert.deepEqual(est.values, ["26 27 26.10"]);
  assert.equal(r.columns.length, 2, "blank names and blank values create nothing");
  assert.deepEqual(r.attrs, { c1: "27", [est.id]: "26 27 26.10" });
  // a value already on the list changes nothing
  const same = resolveTemplateAttrs(cols, { "CSI Division": "26" }, mint);
  assert.equal(same.columns, cols);
  assert.deepEqual(same.attrs, { c1: "26" });
  // a column with a blank name is never matched
  const blank = resolveTemplateAttrs([{ id: "b", name: "  ", values: [] }], { "": "q", "Est. code": "z" }, mint);
  assert.equal(blank.columns.length, 2);
});

test("chest: a condition's labels go in by name and come back out onto another project's columns", () => {
  const colsA = [{ id: "a1", name: "Est. code", values: ["E-1"] }, { id: "a2", name: "Phase", values: [] }];
  const c = { id: "x", finish_tag: "REC-20", color: "#2563eb", fill: "#2563eb", hatch: "dots", waste_pct: 0, attrs: { a1: "E-1" }, materials: [{ id: "m", name: "Box", per: 1, basis: "count", unit: "ea" }] };
  assert.deepEqual(attrsByName(c.attrs, colsA), { "Est. code": "E-1" }, "unassigned columns and ids stay out");
  const tpl = templateFromCondition(c, colsA, { category: "Receptacles", seed: false, measure: "count" });
  assert.deepEqual(tpl.attrs_by_name, { "Est. code": "E-1" });
  assert.equal(tpl.category, "Receptacles");
  assert.equal(tpl.seed, false);
  assert.equal(tpl.measure, "count");
  assert.ok(!("id" in tpl.materials[0]), "material ids are minted on instantiation");
  // another project, with a differently-id'd column of the same name
  const colsB = [{ id: "zzz", name: "est. CODE", values: [] }];
  const r = resolveTemplateAttrs(colsB, tpl.attrs_by_name, mint);
  assert.deepEqual(r.attrs, { zzz: "E-1" });
  assert.deepEqual(r.columns[0].values, ["E-1"]);
});

test("chest: saving a condition keeps what it was — mult, waste, grout depth — and sets no chest field it wasn't given", () => {
  const grout = { tileL: 12 };
  const c = { finish_tag: "X", color: "#000", fill: "#000", waste_pct: 5, materials: [
    { id: "w", name: "THHN #10", mult: 4, waste_pct: 10, per: 1, basis: "linear", unit: "lf" },
    { id: "g", name: "Grout", grout, per: 1, basis: "area", unit: "bag" },
  ] };
  const tpl = templateFromCondition(c, []);
  assert.equal(tpl.materials[0].mult, 4);
  assert.equal(tpl.materials[0].waste_pct, 10);
  assert.notEqual(tpl.materials[1].grout, grout, "grout is copied, never shared");
  assert.deepEqual(Object.keys(tpl).filter((k) => ["category", "seed", "measure", "attrs_by_name"].includes(k)), []);
  assert.equal(tpl.hatch, "solid");
});

test("chest: the measure a condition has been used with is its most common shape role", () => {
  const shapes = [
    { condition_id: "c", measure_role: "linear" }, { condition_id: "c", measure_role: "linear" }, { condition_id: "c", measure_role: "count" },
    { condition_id: "d", measure_role: "floor_area" }, { condition_id: "d", measure_role: "deduct" }, { condition_id: "e", measure_role: "surface_area" },
  ];
  assert.equal(inferMeasure(shapes, "c"), "linear");
  assert.equal(inferMeasure(shapes, "d"), "area", "a deduct says nothing about the tool");
  assert.equal(inferMeasure(shapes, "e"), "area");
  assert.equal(inferMeasure(shapes, "nope"), null);
  assert.equal(inferMeasure(undefined as any, "c"), null);
});

test("chest: a fresh project gets a blank Est. code column; an existing project's columns are left alone", () => {
  const fresh = seedWorkspace([], []);
  assert.deepEqual(fresh.columns.map((c: any) => [c.name, c.values]), [[EST_CODE_COLUMN, []]]);
  assert.deepEqual(fresh.conditions.map((c: any) => c.finish_tag), ELECTRICAL_DEFAULTS.map((d: any) => d.finish_tag));
  const mine = [{ id: "k", name: "CSI Division", values: ["26"] }];
  const kept = seedWorkspace([], mine);
  assert.equal(kept.columns, mine, "a project that already has columns doesn't get another");
});

test("chest: seeding maps a starred item's labels onto the project's columns", () => {
  const lib = [t("REC-20", { attrs_by_name: { "Est. code": "26 27 26.10" } }), t("SW-1P")];
  const w = seedWorkspace(lib, []);
  const est = w.columns.find((c: any) => c.name === EST_CODE_COLUMN)!;
  assert.deepEqual(est.values, ["26 27 26.10"]);
  assert.equal(w.columns.length, 1, "the code landed in the blank Est. code column, not a second one");
  assert.deepEqual((w.conditions[0] as any).attrs, { [est.id]: "26 27 26.10" });
  assert.equal((w.conditions[1] as any).attrs, undefined);
});

test("chest: a malformed chest field is dropped on load, valid ones survive the round-trip", () => {
  const good = t("OK", { category: "Fire alarm", seed: false, measure: "count", desc: "Speaker/strobe", attrs_by_name: { "Est. code": "1" } });
  assert.deepEqual(sanitizeTemplates(JSON.parse(JSON.stringify([good]))), [good]);
  const [bad] = sanitizeTemplates([t("BAD", { category: 7, seed: "yes", measure: "volume", desc: {}, attrs_by_name: ["x"] })]);
  for (const k of ["category", "seed", "measure", "desc", "attrs_by_name"]) assert.ok(!(k in bad), k);
  const [mixed] = sanitizeTemplates([t("MIX", { category: "  Gear  ", attrs_by_name: { good: "v", "": "x", bad: 3, blank: "  " }, desc: "  " })]);
  assert.equal(mixed.category, "Gear");
  assert.deepEqual(mixed.attrs_by_name, { good: "v" });
  assert.ok(!("desc" in mixed));
  assert.ok(!("attrs_by_name" in sanitizeTemplates([t("E", { attrs_by_name: { a: " " } })])[0]));
});

// ── the starter catalog ──────────────────────────────────────────────────────
const catalog = deviceCatalog();

test("catalog: every tag is unique (case-insensitive) and every item is complete", () => {
  const seen = new Set<string>();
  const hatches = new Set(HATCHES.map((h: any) => h.id));
  for (const d of catalog as any[]) {
    const key = d.finish_tag.toUpperCase();
    assert.ok(!seen.has(key), `duplicate tag ${d.finish_tag}`);
    seen.add(key);
    assert.match(d.finish_tag, /^[A-Z0-9][A-Z0-9-]*$/, d.finish_tag);
    assert.ok(CHEST_ORDER.includes(d.category), `${d.finish_tag}: group ${d.category}`);
    assert.ok(d.desc && d.desc.length <= 120, `${d.finish_tag}: description`);
    assert.ok(d.measure === "count" || d.measure === "linear", `${d.finish_tag}: measure`);
    assert.match(d.color, /^#[0-9a-f]{6}$/i, `${d.finish_tag}: color`);
    assert.ok(hatches.has(d.hatch), `${d.finish_tag}: hatch ${d.hatch}`);
    assert.equal(d.seed, false, `${d.finish_tag}: starter items are chest-only`);
    assert.ok(Array.isArray(d.materials));
    for (const m of d.materials) assert.ok(m.name && m.per > 0 && ["count", "linear"].includes(m.basis), `${d.finish_tag}: ${m.name}`);
  }
  assert.ok(catalog.length >= 100, `${catalog.length} starter items`);
});

test("catalog: the devices an estimator asks for first are there, in the right group", () => {
  const by = Object.fromEntries((catalog as any[]).map((d) => [d.finish_tag, d]));
  assert.equal(by["REC-20"].category, "Receptacles");
  assert.match(by["REC-20-SW"].desc, /Switched/i);
  assert.equal(by["REC-20-SW"].category, "Receptacles");
  assert.match(by["FA-SS-W"].desc, /Speaker\/strobe, wall/);
  assert.equal(by["FA-SS-W"].category, "Fire alarm");
  assert.equal(by["FA-SS-C"].category, "Fire alarm");
  assert.equal(by["LT-STRIP"].measure, "linear");
  assert.equal(by["LT-2X4"].measure, "count");
  const groups = new Set((catalog as any[]).map((d) => d.category));
  for (const g of ["Receptacles", "Switches", "Lighting", "Lighting controls", "Fire alarm", "Data / low voltage", "Power & equipment", "Gear"]) assert.ok(groups.has(g), g);
});

test("catalog: the eight starters a new project begins with are in it, unchanged", () => {
  const by = Object.fromEntries((catalog as any[]).map((d) => [d.finish_tag, d]));
  for (const seed of ELECTRICAL_DEFAULTS as any[]) {
    const d = by[seed.finish_tag];
    assert.ok(d, `${seed.finish_tag} missing from the catalog`);
    for (const k of ["color", "hatch", "waste_pct", "materials"]) assert.deepEqual(d[k], seed[k], `${seed.finish_tag}.${k}`);
  }
});

test("catalog: every item instantiates into a condition, and a fresh copy can't mutate the catalog", () => {
  for (const d of catalog as any[]) {
    const c = instantiateTemplate(d);
    assert.equal(c.finish_tag, d.finish_tag);
    assert.equal(c.multiplier, 1);
    assert.equal(c.materials.length, d.materials.length);
  }
  deviceCatalog()[0].materials.push({ name: "mutated" });
  deviceCatalog()[0].finish_tag = "MUTATED";
  assert.notEqual(deviceCatalog()[0].finish_tag, "MUTATED");
  assert.ok(!deviceCatalog()[0].materials.some((m: any) => m.name === "mutated"));
});

test("catalog: starters already in the chest (any case, any spacing) aren't added again", () => {
  const total = deviceCatalog().length;
  assert.equal(missingStarters([]).length, total);
  assert.equal(missingStarters(["rec-20", " FA-SS-W "]).length, total - 2);
  assert.equal(missingStarters(new Set(deviceCatalog().map((d: any) => d.finish_tag))).length, 0);
});

test("chest: a kept raceway run files under Raceway, arms the linear tool, and never seeds a project", () => {
  const tpl = racewayTemplate({ type: "EMT", size: "3/4", count: 3, wire: "10", mount: "CONC" }, "#2563eb");
  assert.equal(tpl.category, "Raceway");
  assert.equal(tpl.measure, "linear");
  assert.equal(tpl.seed, false);
  assert.match(tpl.desc, /3\/4" EMT, 3 #10, on concrete/);
  assert.deepEqual(sanitizeTemplates([tpl])[0].category, "Raceway");
  assert.deepEqual(seedTemplates([tpl], ELECTRICAL_DEFAULTS), ELECTRICAL_DEFAULTS);
});
