// Tool chest (electrical fork) — the condition-template Library, organized the
// way a Bluebeam tool chest is: items grouped by category, searchable, each
// carrying its labels (custom-column values) and which measuring tool it uses.
// Pure helpers so the grouping, search, seeding and label-mapping rules are
// node-testable, independent of the canvas.
//
// A chest item is a condition template (lib/templates.js) plus four additive
// fields:
//   category       the group it sits in ("Receptacles", "Fire alarm", …)
//   measure        "count" | "linear" | "area" — the tool Apply arms
//   seed           false = kept in the chest only; absent or true = also starts
//                  new projects. Absent seeds, so a library saved before the
//                  chest existed behaves exactly as it did.
//   desc           one line saying what it is ("Speaker/strobe, wall mount")
//   attrs_by_name  { "Est. code": "26 27 26.10" } — custom-column values keyed
//                  by column NAME. Column ids are per-project; names are what
//                  carries across projects.
import { attrValue } from "./conditionColumns.js";

export const OTHER = "Other";
export const EST_CODE_COLUMN = "Est. code";

// groups read in this order; anything else follows alphabetically, Other last
export const CHEST_ORDER = [
  "Receptacles", "Switches", "Lighting", "Lighting controls", "Fire alarm",
  "Data / low voltage", "Power & equipment", "Gear", "Raceway",
];

const MEASURES = new Set(["count", "linear", "area"]);
const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const vis = (v) => (typeof v === "string" && v.trim() ? v : "");

export const templateCategory = (t) => (vis(t?.category) ? t.category.trim() : OTHER);
export const seedsNewProjects = (t) => t?.seed !== false;
export const measureTool = (t) => (MEASURES.has(t?.measure) ? t.measure : null);

/** The templates a new project starts with: the starred (or legacy) ones, else the built-in defaults. */
export function seedTemplates(library, defaults) {
  const starred = (Array.isArray(library) ? library : []).filter(seedsNewProjects);
  return starred.length ? starred : defaults;
}

const haystack = (t) => [
  t.finish_tag, templateCategory(t), t.desc,
  ...Object.values(isObj(t.attrs_by_name) ? t.attrs_by_name : {}),
  ...(Array.isArray(t.materials) ? t.materials.map((m) => m?.name) : []),
].filter((s) => typeof s === "string").join(" ").toLowerCase();

/**
 * The chest as groups: [{ name, items: [{ t, idx }] }]. `idx` is the item's
 * position in the UNFILTERED library — rename/delete/star address by position.
 * A query matches when every word appears in the tag, group, labels, or a
 * material name.
 */
export function chestGroups(templates, query = "") {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const groups = new Map();
  (Array.isArray(templates) ? templates : []).forEach((t, idx) => {
    if (words.length) { const h = haystack(t); if (!words.every((w) => h.includes(w))) return; }
    const name = templateCategory(t);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push({ t, idx });
  });
  const rank = (n) => { const i = CHEST_ORDER.indexOf(n); return n === OTHER ? 1e6 : i < 0 ? 1e3 : i; };
  const byName = (a, b) => String(a.t.finish_tag).localeCompare(String(b.t.finish_tag), undefined, { numeric: true, sensitivity: "base" });
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([name, items]) => ({ name, items: items.sort(byName) }));
}

/** { columnName: value } for a condition's assigned labels — blank names and unassigned columns are skipped. */
export function attrsByName(attrs, columns) {
  const out = {};
  for (const cc of Array.isArray(columns) ? columns : []) {
    const name = vis(cc?.name) ? cc.name.trim() : "";
    const v = attrValue(attrs, cc?.id);
    if (name && v) out[name] = v;
  }
  return out;
}

/**
 * Map template labels onto a project's columns BY NAME (case-insensitive).
 * A missing column is created, a missing value added to its list — so an item
 * carries its labels into any project. Returns { columns, attrs } where attrs
 * is { [columnId]: value }. `columns` keeps its identity when nothing changed.
 */
export function resolveTemplateAttrs(columns, byName, mintId) {
  let cols = Array.isArray(columns) ? columns : [];
  const attrs = {};
  if (!isObj(byName)) return { columns: cols, attrs };
  for (const [rawName, rawValue] of Object.entries(byName)) {
    const name = String(rawName).trim();
    const value = vis(rawValue);
    if (!name || !value) continue;
    let col = cols.find((c) => vis(c.name) && c.name.trim().toLowerCase() === name.toLowerCase());
    if (!col) { col = { id: mintId(), name, values: [] }; cols = [...cols, col]; }
    if (!col.values.includes(value)) {
      const id = col.id;
      cols = cols.map((c) => (c.id === id ? { ...c, values: [...c.values, value] } : c));
    }
    attrs[col.id] = value;
  }
  return { columns: cols, attrs };
}

// the measuring tool a condition has been used with — its most common shape role
const ROLE_TOOL = { count: "count", linear: "linear", floor_area: "area", surface_area: "area" };
export function inferMeasure(shapes, conditionId) {
  const n = {};
  for (const s of shapes || []) if (s.condition_id === conditionId && ROLE_TOOL[s.measure_role]) n[ROLE_TOOL[s.measure_role]] = (n[ROLE_TOOL[s.measure_role]] || 0) + 1;
  const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

/**
 * A condition as a chest item: appearance, waste, materials (ids are minted on
 * instantiation), the labels it carries, and the chest fields. `extra` sets
 * category / seed / measure.
 */
export function templateFromCondition(c, columns = [], extra = {}) {
  const byName = attrsByName(c.attrs, columns);
  return {
    finish_tag: c.finish_tag, color: c.color, fill: c.fill, hatch: c.hatch || "solid",
    waste_pct: c.waste_pct || 0,
    ...(c.height_ft != null ? { height_ft: c.height_ft } : {}),
    ...(c.thickness_in != null ? { thickness_in: c.thickness_in } : {}),
    ...(c.laborType != null ? { laborType: c.laborType } : {}),
    ...(c.subfloorType != null ? { subfloorType: c.subfloorType } : {}),
    ...(c.roll_setup ? { roll_setup: { ...c.roll_setup } } : {}),   // #136 — the roll spec is part of what makes a CPT-1 template CPT-1
    materials: (c.materials || []).map(({ id: _id, ...m }) => (m.grout ? { ...m, grout: { ...m.grout } } : m)),   // ids are minted on instantiation; grout never shared by reference
    ...(Object.keys(byName).length ? { attrs_by_name: byName } : {}),
    ...(vis(extra.category) ? { category: extra.category.trim() } : {}),
    ...(typeof extra.seed === "boolean" ? { seed: extra.seed } : {}),
    ...(MEASURES.has(extra.measure) ? { measure: extra.measure } : {}),
  };
}
