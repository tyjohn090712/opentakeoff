// Breakout areas (electrical fork): named regions drawn on a sheet — Area A,
// Level 2 North, Phase 1 — that split a count by where each item sits. The
// name IS a shape label (lib/shapeLabels.js), so a count committed inside an
// area carries that label and the Report's Group: Label mode breaks the total
// out by area with no new reporting code.
//
// Persisted as the additive `breakout_areas` payload key:
//   [{ id, name, sheet_id, verts_norm: [[x, y], …] }]   (normalized per sheet)
// plus `no_breakouts: true` when the estimator has said the job has none.
// Autocount (the Symbol tool) won't run until one of the two is true.
import { pointInPoly } from "./geometry.js";

const visible = (v) => (typeof v === "string" && v.trim() ? v.trim() : "");
const finitePt = (p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);

/** Defensive hydrate: drop anything without a name, a sheet, or a 3-point ring. */
export function sanitizeBreakoutAreas(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a === "object" && visible(a.name) && visible(a.sheet_id) && Array.isArray(a.verts_norm) && a.verts_norm.filter(finitePt).length >= 3)
    .map((a) => ({ id: visible(a.id) || `ba-${Math.random().toString(36).slice(2, 10)}`, name: visible(a.name), sheet_id: a.sheet_id, verts_norm: a.verts_norm.filter(finitePt).map(([x, y]) => [x, y]) }));
}

/**
 * The breakout area a normalized point on a sheet falls in, or null. The first drawn wins an overlap.
 * @param {any[]} areas
 * @param {string} sheetId
 * @param {number[]} pt
 * @returns {any}
 */
export function areaAt(areas, sheetId, pt) {
  for (const a of areas || []) {
    if (a.sheet_id !== sheetId) continue;
    if (pointInPoly(pt[0], pt[1], a.verts_norm)) return a;
  }
  return null;
}

/**
 * Areas on one sheet.
 * @param {any[]} areas
 * @param {string} sheetId
 * @returns {any[]}
 */
export function areasOn(areas, sheetId) { return (areas || []).filter((a) => a.sheet_id === sheetId); }

/**
 * Can autocount run, and in which ways? `scope` is "sheet" or "all", `split`
 * is "one" (one total) or "areas" (by breakout area).
 *   - nothing drawn and "no breakout areas" not ticked → blocked
 *   - "no breakout areas" ticked → one total only
 *   - by area on this sheet needs an area on this sheet
 * Returns { ok, reason } — the reason is shown in the window.
 * @param {{ areas?: any[], noBreakouts?: boolean, sheetId?: string, scope?: string, split?: string }} args
 * @returns {{ ok: boolean, reason: string }}
 */
export function autocountGate({ areas = [], noBreakouts = false, sheetId = "", scope = "sheet", split = "one" }) {
  const any = areas.length > 0;
  if (!any && !noBreakouts) return { ok: false, reason: "Mark up the breakout areas first (Areas tool, B), or tick “This job has no breakout areas.”" };
  if (split === "areas") {
    if (!any) return { ok: false, reason: "No breakout areas are drawn — count as one total, or draw the areas first." };
    if (scope === "sheet" && !areasOn(areas, sheetId).length) return { ok: false, reason: "This sheet has no breakout areas — draw them here, or count it as one total." };
  }
  return { ok: true, reason: "" };
}

/** "Area A 5 · Area B 3 · outside any area 1" for a commit message. */
export function areaTallyText(names) {
  const t = new Map();
  for (const n of names) { const k = n || ""; t.set(k, (t.get(k) || 0) + 1); }
  return [...t.entries()].sort((a, b) => (a[0] === "") - (b[0] === "") || a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([k, n]) => `${k || "outside any area"} ${n}`).join(" · ");
}
