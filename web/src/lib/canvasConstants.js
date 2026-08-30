// Pure data constants for the Takeoff Canvas — render/zoom budgets, snap
// tuning, toolbar tool descriptors, and the electrical starter conditions.
// No DOM, no React, no functions: values only, moved verbatim from
// pages/TakeoffCanvas.jsx so the canvas and any future reader share one copy.
// (This fork is electrical-only — the upstream flooring seed set, its grout
// tile-geometry import, and roll-goods setup have been dropped rather than
// kept generic. See docs/ELECTRICAL_FORK.md.)

export const MIN_SCALE = 0.03;
export const MAX_SCALE = 32;  // stage zoom is in raster px — with the 28MP base budget this keeps ≈ the old deep-zoom ceiling (detail view carries the crispness)
export const PANEL_GAP = 48;  // px between side-by-side sheets in a multi-sheet group
// Base raster: enough density for fit-to-view + the first stretch of zoom; sharpness
// past 1:1 comes from the DETAIL VIEW (region re-render), never from a giant full-sheet
// bitmap. Rastering to the browser caps would put a 36×24" sheet at 179MP ≈ 716MB of
// backing store per panel — a 4-up ≈ 2.9GB, which Chrome silently fails to keep
// composited (blank sheet at zoom-out, evicted chrome). Quantities are scale-free
// (verts are normalized and the render factor cancels in the area math), so the budget
// only trades memory for base-layer sharpness. Hi-Res opts a sheet INTO the auto
// budget per-user (the default stays the lean baseline raster).
export const QUALITY_CEILING = 8.0;                  // hard cap on render scale (≈576 px/in) — binds only on small pages now
export const MAX_CANVAS_DIM  = 16384;                // safe max side for a single canvas (Chrome/Firefox/Safari desktop)
export const MAX_CANVAS_AREA = 16384 * 16384 * 0.9;  // per-canvas pixel cap — the DETAIL view's density factor uses this
export const MAX_PANEL_AREA  = 28e6;                 // base-raster pixel budget per panel (~112MB RGBA; 4-up ≈ 450MB)
export const MARKUP_IMG_MAX = 1600;                  // px longest side of a stored image markup (capture AND upload downscale to this, then re-encode)
export const MAX_IMAGE_MARKUP_BYTES = 16 * 1024 * 1024;  // aggregate cap across a project's image markups — refuse a new one that would push the annotations blob past this
export const MARKUP_UPLOAD_MAX_BYTES = 25 * 1024 * 1024; // reject an upload FILE larger than this BEFORE decode (cheap OOM guard for a huge file)
export const MARKUP_DECODE_MAX_AREA = 40e6;          // reject a decoded upload above ~40M px — a 1600px annotation never needs more, and this bounds the transient RGBA allocation (NOT the 241M render-canvas cap)
// Detail view: once zoomed past the base raster's 1:1 IN DEVICE PIXELS, we overlay a
// crop of JUST the visible region, re-rendered from the PDF vectors at the current zoom —
// the way desktop CAD viewers do. Crispness becomes unbounded (up to the per-region canvas cap)
// without ever holding a giant full-sheet bitmap; the region is ~viewport-sized so the cap
// effectively never binds. Engage compares t.scale × devicePixelRatio (softness starts
// when the raster is upscaled in device px — on a 2× display that's t.scale 0.5, not 1).
export const DETAIL_ENGAGE = 1.15;  // engage once stage zoom × dpr passes ~1.15 (base raster starts to soften)
// Render this much extra region beyond the viewport so small pans don't
// expose an unfetched edge. 0.5 (4x the viewport's tile area) was the right
// number for the OLD single-region crop render (one pdf.js call regardless
// of margin size, so a bigger margin was nearly free); with #86's tile pool,
// margin scales the TILE COUNT quadratically ((1+2*margin)^2), and a fat
// margin was a real, measured contributor to "buffering takes forever" —
// dropped to 0.25 (2.25x area, ~44% fewer tiles than 0.5) once that shipped.
export const DETAIL_MARGIN = 0.25;
export const SYNC_MS = 90;          // React tf-mirror sync cadence during gestures (~11Hz)
export const GESTURE_MS = 140;      // wheel/pinch quiet window before the detail view re-renders
// A backgrounded/hidden tab can suspend pdf.js's render scheduling indefinitely (promise
// neither resolves nor rejects, no console error — Chrome throttles rAF-gated work in
// hidden tabs). The primary recovery for THAT case is the visibilitychange retry below —
// this is only a backstop for some other, unknown cause of a wedged render, so it's set
// long enough to never fire on a merely slow (not stuck) render — confirmed live: a large
// region under real CPU contention took 50+ seconds and still resolved on its own.
export const DETAIL_STALL_MS = 25000;

export const SNAP_CELL = 24;   // snap-grid bucket, raster px (Spline runs 12 — its budgeted raster is denser)

// toolbar menus — STACK-style: the menu face shows the armed tool
export const MEASURE_TOOLS = [
  { id: "oneclick", icon: "oneClick", label: "One-Click Area", shortcut: "O" },
  { id: "area", icon: "area", label: "Area", shortcut: "A" },
  { id: "rect", icon: "rectTool", label: "Rectangle", shortcut: "R" },
  { id: "linear", icon: "linear", label: "Linear", shortcut: "L" },
  { id: "surface", icon: "surface", label: "Surface Area", shortcut: "S" },
  { id: "count", icon: "count", label: "Count", shortcut: "C" },
  { id: "symbol", icon: "symbol", label: "Symbol — marquee ONE instance, count every placement (#264)", shortcut: "Y" },
];
export const CUT_TOOLS = [
  { id: "deduct", icon: "deduct", label: "Deduct shape", shortcut: "D" },
  { id: "deduct-rect", icon: "deductRect", label: "Deduct rectangle", shortcut: "⇧D" },
];
export const MARKUP_TOOLS = [
  { id: "highlighter", icon: "highlighter", label: "Highlighter", shortcut: "H" },
  { id: "cloud", icon: "cloud", label: "Revision cloud" },
  { id: "callout", icon: "callout", label: "Callout" },
  { id: "text", icon: "textNote", label: "Text note" },
  { id: "highlight", icon: "highlight", label: "Highlight box" },
  // N, not M — M is the push-to-talk dictation hold, globally
  { id: "dimension", icon: "dimension", label: "Dimension line", shortcut: "N" },
  { id: "image", icon: "image", label: "Image — marquee a region, or upload a file" },
];
export const MARKUP_IDS = MARKUP_TOOLS.map((t) => t.id);
// highlighter inks — literal hex (SVG attrs; CSS vars don't resolve there).
// The freehand TOOL is "highlighter" (the two-corner "highlight" box above is
// its own tool); its strokes persist as type:"highlight" + pts, the same
// record the pre-fork canvas wrote, so old saved strokes render unchanged —
// every reader discriminates on pts (stroke) vs rect (box).
export const HL_INKS = ["#ffd60a", "#ff9f0a", "#34c759", "#3fa9ff", "#ff6ea8"];
export const HL_SIZES = [["F", 8], ["M", 14], ["B", 22]];   // screen px at draw time

// Electrical starter conditions seeded on a fresh workspace — line color +
// hatch chosen so a condition reads at a glance; waste % is a sensible
// default you can change per condition (it's never auto-applied to the live
// readout, only the Report). Delete/edit any you don't need — these are
// starting points against Prime's Accubid systems list, not a fixed taxonomy.
//
// Two condition shapes are in play, same as upstream flooring — only the
// domain changed:
//   - COUNT conditions (place_count / symbol_sweep shapes): devices, fixtures,
//     panels. materials use basis "count" — qty = device count ÷ per, rounded
//     up (e.g. 1 box per device).
//   - LINEAR conditions (measure_line shapes): raceway/branch-circuit runs.
//     materials use basis "linear" — qty = raceway LF ÷ per, rounded up.
//     Conductor footage is NOT a materials line — it's the condition's own
//     ×N multiplier (README: "waste %, an ×N multiplier"). instantiateTemplate
//     always seeds multiplier: 1; set it per instance to the circuit's
//     conductor count (e.g. 3 for a 20A/1P home run: hot + neutral + ground)
//     and the report's LF, LF-net, and every linear-basis material line all
//     scale with it automatically (totals.js conditionTotals: lf *= mult
//     happens before basisVal is read) — no separate wire-footage tool needed
//     for the Wave-3.1 (raceway-as-linear-condition) pass.
//
// Expressed in TEMPLATE shape (finish_tag/waste_pct/materials, no fill — it
// defaults from color) so seeding and the Library run the same constructor.
export const ELECTRICAL_DEFAULTS = [
  { finish_tag: "REC-20",    color: "#2563eb", hatch: "dots",      waste_pct: 0, materials: [                                            // Duplex receptacle, 20A/1P general use
    { name: "Single-gang device box", per: 1, basis: "count", unit: "ea" },
    { name: "Device plate",           per: 1, basis: "count", unit: "ea" },
  ] },
  { finish_tag: "REC-GFCI",  color: "#0d9488", hatch: "honeycomb", waste_pct: 0, materials: [                                            // GFCI receptacle, 20A/1P
    { name: "Single-gang device box", per: 1, basis: "count", unit: "ea" },
    { name: "GFCI device plate",      per: 1, basis: "count", unit: "ea" },
  ] },
  { finish_tag: "SW-1P",     color: "#9333ea", hatch: "plus",      waste_pct: 0, materials: [{ name: "Single-gang device box", per: 1, basis: "count", unit: "ea" }, { name: "Switch plate", per: 1, basis: "count", unit: "ea" }] },  // Single-pole switch
  { finish_tag: "SW-3W",     color: "#be185d", hatch: "cross",     waste_pct: 0, materials: [{ name: "Single-gang device box", per: 1, basis: "count", unit: "ea" }, { name: "Switch plate", per: 1, basis: "count", unit: "ea" }] },  // 3-way switch
  { finish_tag: "DATA-1",    color: "#0891b2", hatch: "scan",      waste_pct: 0, materials: [{ name: "Low-voltage mounting bracket", per: 1, basis: "count", unit: "ea" }] },                                                          // Data/voice outlet (RJ45)
  { finish_tag: "LT-2X4",    color: "#b8860b", hatch: "grid",      waste_pct: 0, materials: [] },                                                                                                                                       // 2×4 LED troffer — fixture cost usually rides the schedule, not a coverage material
  { finish_tag: "LT-STRIP",  color: "#dc2626", hatch: "horiz",     waste_pct: 5, materials: [                                            // Linear/strip LED — a LINEAR condition, traced as a run
    { name: "Whips/connectors", per: 8, basis: "linear", unit: "ea", note: "placeholder ~1 per 8 LF run — verify against the fixture's own connection spec" },
  ] },
  { finish_tag: "PNL",       color: "#1f2937", hatch: "solid",     waste_pct: 0, materials: [] },                                                                                                                                       // Panelboard / equipment placement — a COUNT condition
  { finish_tag: "EMT-BRANCH", color: "#c96442", hatch: "circuit",  waste_pct: 5, materials: [                                            // Branch-circuit raceway (EMT) — a LINEAR condition; set the condition's ×N multiplier to the run's conductor count
    { name: "THHN conductor",       kind: "conductor", per: 1,  basis: "linear", unit: "lf", note: "qty scales with the condition's ×N multiplier — see comment above" },
    { name: "EMT couplings/straps", per: 10, basis: "linear", unit: "ea", note: "placeholder rate — verify against your take-off standard" },
  ] },
];
