// Imported panel schedules (electrical fork, Wave 4) — the per-project record
// of what each panelboard's schedule SAYS: header ratings, every circuit
// position, and the breakers you buy. Persisted as the additive
// `panel_schedules` payload key (the rfp_info precedent: omitted when empty,
// else-cleared on load). Pure helpers so hydrate defensiveness and the report
// roll-ups are node-testable, independent of the canvas.
//
// A schedule record is deliberately separate from takeoff shapes: the schedule
// is what the drawings say a panel contains; a PNL-<name> count condition is
// where that panel sits on the plan. The two meet only by name.
import { csvEsc } from "./csv.js";
import { panelTotals, breakerLabel, STANDARD_TRIPS } from "./panelSchedule";

export const PANEL_CAP = 500;          // panels per project
export const CIRCUIT_CAP = 300;        // rows per panel (an 84-circuit panel, a switchboard)
const NAME_MAX = 40;
const DESC_MAX = 120;
const INFO_MAX = 60;
const KINDS = new Set(["load", "spare", "space", "withheld"]);
const SIDES = new Set(["L", "R", "S"]);
const INFO_KEYS = ["volts", "bus", "main", "mounting", "aic", "fed_from", "location"];

const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : "");
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

let idSeq = 0;
export function mintPanelId() {
  return `pnl_${Date.now().toString(36)}_${(idSeq++).toString(36)}`;
}

function sanitizeCircuit(c) {
  if (!c || typeof c !== "object" || Array.isArray(c)) return null;
  const ckts = (Array.isArray(c.ckts) ? c.ckts : []).filter((n) => int(n, 1, 999) !== null).slice(0, 6);
  let kind = KINDS.has(c.kind) ? c.kind : "withheld";
  const trip = int(c.trip, 1, 6000);
  const poles = int(c.poles, 1, 3);
  // a breaker row must carry a real breaker; anything less is withheld, never
  // silently counted (a hand-edited payload can't smuggle a bad size into the
  // breaker roll-up)
  if ((kind === "load" || kind === "spare") && (trip === null || poles === null || !STANDARD_TRIPS.has(trip))) kind = "withheld";
  return {
    side: SIDES.has(c.side) ? c.side : "S",
    ckts,
    description: str(c.description, DESC_MAX),
    trip: kind === "space" ? null : trip,
    poles: kind === "space" ? null : poles,
    kind,
    ...(kind === "withheld" ? { reason: str(c.reason, DESC_MAX) || "needs review" } : {}),
  };
}

const clamp01 = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);

/**
 * Defensive hydrate for the additive `panel_schedules` payload key: anything
 * that isn't an array → []; each panel is rebuilt field by field (a corrupt
 * entry is dropped, never rendered), ids de-duplicated.
 */
export function sanitizePanelSchedules(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : [])
    .filter((p) => p && typeof p === "object" && !Array.isArray(p))
    .slice(0, PANEL_CAP)
    .map((p) => {
      const circuits = (Array.isArray(p.circuits) ? p.circuits : []).slice(0, CIRCUIT_CAP).map(sanitizeCircuit).filter(Boolean);
      const info = {};
      const ri = p.info && typeof p.info === "object" && !Array.isArray(p.info) ? p.info : {};
      for (const k of INFO_KEYS) { const v = str(ri[k], INFO_MAX); if (v) info[k] = v; }
      const region = Array.isArray(p.region) && p.region.length === 4 && p.region.every((v) => clamp01(v) !== null) ? p.region.map(clamp01) : null;
      let id = typeof p.id === "string" && p.id && !seen.has(p.id) ? p.id : mintPanelId();
      seen.add(id);
      return {
        id,
        name: str(p.name, NAME_MAX).toUpperCase(),
        sheet_id: str(p.sheet_id, 200),
        ...(region ? { region } : {}),
        source: p.source === "ocr" ? "ocr" : "text",
        info,
        circuits,
        positions: int(p.positions, 0, 999) ?? Math.max(0, ...circuits.flatMap((c) => c.ckts)),
        layout: p.layout === "single" ? "single" : "two-sided",
        imported_at: str(p.imported_at, 40),
      };
    })
    .filter((p) => p.name || p.circuits.length);
}

/** Roll every panel's breakers into one buy list (by poles, then trip). */
export function allPanelsTotals(panels) {
  const by = new Map();
  let spacePositions = 0, withheld = 0;
  for (const p of panels || []) {
    const t = panelTotals(p.circuits);
    spacePositions += t.spacePositions;
    withheld += t.withheld;
    for (const b of t.breakers) {
      const k = `${b.poles}|${b.trip}`;
      const line = by.get(k) || { poles: b.poles, trip: b.trip, count: 0, spares: 0 };
      line.count += b.count; line.spares += b.spares;
      by.set(k, line);
    }
  }
  const breakers = [...by.values()].sort((a, b) => a.poles - b.poles || a.trip - b.trip);
  return { breakers, breakerCount: breakers.reduce((a, b) => a + b.count, 0), spacePositions, withheld };
}

/**
 * Panel schedules as CSV for the estimate (Accubid / a spreadsheet): one row
 * per panel per breaker size, a SPACE row per panel with open positions, and
 * every withheld circuit listed by itself so an unresolved row is never lost
 * between the drawing and the bid.
 */
export function panelSchedulesToCsv(panels, sheetLabel = (id) => id) {
  const head = ["Panel", "Sheet", "Volts", "Bus", "Main", "Mounting", "Item", "Poles", "Trip (A)", "Qty", "Of which spare", "Circuits / note"];
  const lines = [head.map(csvEsc).join(",")];
  for (const p of panels || []) {
    const t = panelTotals(p.circuits);
    const base = [p.name, sheetLabel(p.sheet_id) || p.sheet_id || "", p.info?.volts || "", p.info?.bus || "", p.info?.main || "", p.info?.mounting || ""];
    for (const b of t.breakers) lines.push([...base, `BKR ${breakerLabel(b.trip, b.poles)}`, b.poles, b.trip, b.count, b.spares, ""].map(csvEsc).join(","));
    if (t.spacePositions) lines.push([...base, "SPACE", "", "", t.spacePositions, "", "pole positions with no breaker"].map(csvEsc).join(","));
    for (const c of p.circuits.filter((x) => x.kind === "withheld")) {
      lines.push([...base, "UNRESOLVED", c.poles ?? "", c.trip ?? "", "", "", `ckt ${c.ckts.join(",") || "?"} ${c.description} — ${c.reason || "needs review"}`.trim()].map(csvEsc).join(","));
    }
  }
  return lines.join("\n") + "\n";
}

/** "20A 1P ×12 · 30A 2P ×2" — the one-line breaker summary the report shows. */
export function breakerSummaryText(breakers) {
  return breakers.map((b) => `${breakerLabel(b.trip, b.poles)} ×${b.count}`).join(" · ");
}
