// Condition template library (browser-global `condition_templates` meta
// record). Templates are conditions minus ids — the canvas mints fresh ids on
// instantiation — and the record is shared across every project in the
// browser, so a single corrupt item would break hydrate's fresh-workspace
// seeding and the Library tab for ALL projects at once. This sanitizer is the
// load gate (the sanitizeConditionColumns precedent): store.loadTemplates()
// routes through it so nothing malformed ever reaches the canvas.
//
// The contract — deliberately minimal ("safe to dereference and render", not
// a re-implementation of the canvas's defaulting): every returned item is a
// plain object with
//   - a non-empty (visible) string `finish_tag`  (items without one are dropped);
//   - `color` / `fill` / `hatch` strings when present (non-string values are
//     removed so the canvas's own `||` defaulting kicks in);
//   - an array-of-plain-objects `materials`      (non-array → [], non-object
//     entries dropped — instantiateTemplate spreads each entry and the record
//     would otherwise throw on .map or mint garbage material rows).
// Everything else — waste_pct coercion, height/thickness passthrough, color
// defaults — is instantiateTemplate's job. Unknown item fields pass through
// (the scale_source precedent: stripping a future field on load would persist
// the loss on the next library save).

const isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

export function sanitizeTemplates(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => isPlainObject(t) && typeof t.finish_tag === "string" && t.finish_tag.trim())
    .map((t) => {
      const out = { ...t, materials: (Array.isArray(t.materials) ? t.materials : []).filter(isPlainObject) };
      for (const k of ["color", "fill", "hatch"]) {
        if (k in out && typeof out[k] !== "string") delete out[k];
      }
      // the tool-chest fields (lib/chest.js): a malformed one is dropped, so the
      // item falls back to the group "Other", seeds as before, arms no tool, and
      // carries no labels — never a throw in the panel that renders them
      if ("category" in out) {
        if (typeof out.category === "string" && out.category.trim()) out.category = out.category.trim().slice(0, 40);
        else delete out.category;
      }
      if ("desc" in out) {
        if (typeof out.desc === "string" && out.desc.trim()) out.desc = out.desc.trim().slice(0, 120);
        else delete out.desc;
      }
      if ("seed" in out && typeof out.seed !== "boolean") delete out.seed;
      if ("measure" in out && !["count", "linear", "area"].includes(out.measure)) delete out.measure;
      if ("adder_ft" in out && !(typeof out.adder_ft === "number" && out.adder_ft > 0 && Number.isFinite(out.adder_ft))) delete out.adder_ft;   // the Space adder length (lib/runPoints.js)
      if ("attrs_by_name" in out) {
        const ok = isPlainObject(out.attrs_by_name)
          ? Object.fromEntries(Object.entries(out.attrs_by_name).filter(([k, v]) => k.trim() && typeof v === "string" && v.trim()))
          : {};
        if (Object.keys(ok).length) out.attrs_by_name = ok; else delete out.attrs_by_name;
      }
      return out;
    });
}
