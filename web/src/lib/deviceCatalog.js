// Starter device catalog for the tool chest (electrical fork) — the device
// types an estimator takes off, one item each, grouped by category: receptacles
// by amperage and function, switches, fixtures, lighting controls, fire alarm
// devices, low-voltage, equipment connections, and gear. "Add starter devices"
// in the chest adds the ones not already there.
//
// Every item is a COUNT condition (a LINEAR one where the run is the quantity:
// strip, track, tape). `materials` are the ancillaries bought with the device —
// box, plate, bracket — never the device itself: the condition's EA count IS
// the device count. Starting points to edit in the app, not a taxonomy: change
// a line, regroup, rename, or save your own version over it.
//
// The eight tags every new project starts with (ELECTRICAL_DEFAULTS) are
// reused verbatim — same color, hatch and materials — so the chest and a fresh
// project agree about REC-20 and PNL.
import { ELECTRICAL_DEFAULTS } from "./canvasConstants.js";

const COLOR = {
  Receptacles: "#2563eb", Switches: "#9333ea", Lighting: "#b8860b", "Lighting controls": "#c96442",
  "Fire alarm": "#dc2626", "Data / low voltage": "#0891b2", "Power & equipment": "#2f7d54", Gear: "#1f2937",
};
// cycled within a category so neighbors in the chest read differently on the plan
const HATCH = ["dots", "plus", "cross", "scan", "grid", "horiz", "vert", "diag", "diag2", "honeycomb", "checker", "wave", "iso", "hexagon", "speckle", "concrete"];

const line = (name) => ({ name, per: 1, basis: "count", unit: "ea" });
const BOX = "Single-gang device box", PLATE = "Device plate", SW_PLATE = "Switch plate";
const SQ_BOX = "4-11/16 square box", SQ_RING = "Single-gang plaster ring (square)", SQ2_RING = "Two-gang plaster ring (square)", PLATE2 = "Two-gang device plate";
const BACK = "Back box", BRACKET = "Low-voltage mounting bracket";
const OUTLET = [BOX, PLATE], SWITCH = [BOX, SW_PLATE], HEAVY = [SQ_BOX, SQ_RING, PLATE];

// [tag, description, ancillary lines, options]   options: { measure: "linear" }
const CATALOG = {
  Receptacles: [
    ["REC-15", "Duplex receptacle, 15A 125V (5-15R)", OUTLET],
    ["REC-20", "Duplex receptacle, 20A 125V (5-20R)", OUTLET],
    ["REC-20-SW", "Switched (half-hot) duplex receptacle, 20A", OUTLET],
    ["REC-20-SIMPLEX", "Single receptacle, 20A (5-20R)", OUTLET],
    ["REC-20-QUAD", "Quad receptacle (two duplex), 20A", [SQ_BOX, SQ2_RING, PLATE2]],
    ["REC-GFCI", "GFCI duplex receptacle, 20A", [BOX, "GFCI device plate"]],
    ["REC-GFCI-WP", "GFCI duplex, weather-resistant, in-use cover", [BOX, "In-use cover"]],
    ["REC-20-USB", "Duplex receptacle with USB charging, 20A", OUTLET],
    ["REC-20-IG", "Isolated-ground duplex receptacle, 20A", OUTLET],
    ["REC-20-SPD", "Surge-protective duplex receptacle, 20A", OUTLET],
    ["REC-20-EM", "Duplex receptacle on emergency power, 20A", OUTLET],
    ["REC-20-CEIL", "Duplex receptacle, ceiling mount, 20A", OUTLET],
    ["REC-20-208V", "Receptacle, 20A 250V (6-20R)", OUTLET],
    ["REC-30-DRYER", "Dryer receptacle, 30A 125/250V (14-30R)", HEAVY],
    ["REC-50-RANGE", "Range receptacle, 50A 125/250V (14-50R)", HEAVY],
    ["REC-TL-20", "Twist-lock receptacle, 20A 125V (L5-20R)", OUTLET],
    ["REC-TL-30", "Twist-lock receptacle, 30A 125/250V (L14-30R)", HEAVY],
    ["REC-CLOCK", "Clock-hanger receptacle", [BOX, "Clock hanger plate"]],
    ["REC-FLOOR", "Floor box with duplex receptacle", []],
    ["REC-POKE", "Poke-thru, floor", []],
  ],
  Switches: [
    ["SW-1P", "Single-pole switch, 20A", [BOX, SW_PLATE]],
    ["SW-3W", "3-way switch, 20A", [BOX, SW_PLATE]],
    ["SW-4W", "4-way switch, 20A", SWITCH],
    ["SW-2P", "Double-pole switch, 20A", SWITCH],
    ["SW-1P-2G", "Two single-pole switches, two-gang", ["Two-gang device box", "Two-gang switch plate"]],
    ["SW-DIM", "Dimmer, single-pole", SWITCH],
    ["SW-DIM-3W", "Dimmer, 3-way", SWITCH],
    ["SW-OCC", "Occupancy-sensor wall switch", SWITCH],
    ["SW-VAC", "Vacancy-sensor wall switch", SWITCH],
    ["SW-KEY", "Key switch, single-pole", SWITCH],
    ["SW-PILOT", "Switch with pilot light", SWITCH],
    ["SW-MOM", "Momentary-contact switch", SWITCH],
    ["SW-TIMER", "Timer switch", SWITCH],
    ["SW-MMS", "Manual motor starter switch (toggle)", SWITCH],
  ],
  Lighting: [
    ["LT-2X4", "2×4 LED troffer, recessed", []],
    ["LT-2X2", "2×2 LED troffer, recessed", []],
    ["LT-1X4", "1×4 LED fixture", []],
    ["LT-DOWN-4", "Recessed downlight, 4 in", []],
    ["LT-DOWN-6", "Recessed downlight, 6 in", []],
    ["LT-PEND", "Pendant fixture", []],
    ["LT-WRAP", "Wraparound / surface fixture", []],
    ["LT-HIBAY", "High-bay fixture", []],
    ["LT-VT", "Vapor-tight fixture", []],
    ["LT-SCONCE", "Wall sconce", []],
    ["LT-WALLPACK", "Wall pack, exterior", []],
    ["LT-POLE", "Pole-mounted fixture", []],
    ["LT-BOLLARD", "Bollard", []],
    ["LT-EXIT", "Exit sign", []],
    ["LT-EXIT-EM", "Exit sign with emergency heads", []],
    ["LT-EM", "Emergency light unit, two-head", []],
    ["LT-EM-REM", "Emergency remote head", []],
    ["LT-STRIP", "Linear / strip LED — traced as a run", null, { measure: "linear" }],
    ["LT-TRACK", "Track lighting — traced as a run", null, { measure: "linear" }],
    ["LT-TAPE", "LED tape / cove — traced as a run", null, { measure: "linear" }],
  ],
  "Lighting controls": [
    ["LC-KEYPAD", "Wall keypad / scene controller", SWITCH],
    ["LC-OCC-C", "Occupancy sensor, ceiling mount", []],
    ["LC-OCC-W", "Occupancy sensor, wall or corner mount", []],
    ["LC-DAYLIGHT", "Daylight sensor", []],
    ["LC-PHOTOCELL", "Photocell, exterior", []],
    ["LC-PP", "Power pack", []],
    ["LC-RELAY", "Lighting control relay", []],
  ],
  "Fire alarm": [
    ["FA-SS-W", "Speaker/strobe, wall mount", [BACK]],
    ["FA-SS-C", "Speaker/strobe, ceiling mount", []],
    ["FA-STROBE-W", "Strobe, wall mount", [BACK]],
    ["FA-STROBE-C", "Strobe, ceiling mount", []],
    ["FA-HS-W", "Horn/strobe, wall mount", [BACK]],
    ["FA-HS-C", "Horn/strobe, ceiling mount", []],
    ["FA-HORN-W", "Horn, wall mount", [BACK]],
    ["FA-SPKR-W", "Speaker, wall mount", [BACK]],
    ["FA-SPKR-C", "Speaker, ceiling mount", []],
    ["FA-SMOKE", "Smoke detector", []],
    ["FA-SMOKE-SND", "Smoke detector with sounder base", []],
    ["FA-HEAT", "Heat detector", []],
    ["FA-DUCT", "Duct smoke detector", []],
    ["FA-BEAM", "Beam smoke detector", []],
    ["FA-CO", "Carbon monoxide detector", []],
    ["FA-PULL", "Manual pull station", [BACK]],
    ["FA-MON", "Monitor module", []],
    ["FA-CTL", "Control module", []],
    ["FA-REL", "Relay module", []],
    ["FA-ISO", "Isolator module", []],
    ["FA-FLOW", "Waterflow switch (monitored)", []],
    ["FA-TAMPER", "Valve tamper switch (monitored)", []],
    ["FA-MAG-HOLD", "Magnetic door holder", []],
    ["FA-ANN", "Remote annunciator", []],
    ["FA-NAC", "NAC power supply", []],
    ["FA-FACP", "Fire alarm control panel", []],
  ],
  "Data / low voltage": [
    ["DATA-1", "Data/voice outlet, one port", [BRACKET]],
    ["DATA-2", "Data/voice outlet, two port", [BRACKET]],
    ["DATA-4", "Data/voice outlet, four port", [BRACKET]],
    ["DATA-FLOOR", "Data outlet, floor box", []],
    ["WAP-C", "Wireless access point, ceiling", []],
    ["WAP-W", "Wireless access point, wall", []],
    ["TV-COAX", "TV / coax outlet", [BRACKET]],
    ["TV-BOX", "TV recessed box (power and data)", []],
    ["CAM-C", "Camera, ceiling", []],
    ["CAM-W", "Camera, wall or exterior", []],
    ["CARD-RDR", "Card reader", []],
    ["DOOR-CONTACT", "Door contact", []],
    ["REX", "Request-to-exit device", []],
    ["INTERCOM", "Intercom station", []],
    ["SPKR-C", "Ceiling speaker (paging / AV)", []],
    ["SPKR-W", "Wall speaker (paging / AV)", []],
    ["VOL-CTL", "Volume control", [BRACKET]],
  ],
  "Power & equipment": [
    ["JB", "Junction box", [SQ_BOX, "Blank cover"]],
    ["JB-PULL", "Pull box", []],
    ["DISC-NF", "Disconnect switch, non-fused", []],
    ["DISC-F", "Disconnect switch, fused", []],
    ["MOTOR-CONN", "Motor connection", []],
    ["VFD", "Variable frequency drive", []],
    ["EQUIP-CONN", "Equipment connection", []],
    ["FURN-FEED", "Furniture feed", []],
    ["HAND-DRYER", "Hand dryer connection", []],
  ],
  Gear: [
    ["PNL", "Panelboard", []],
    ["XFMR", "Transformer, dry-type", []],
    ["SWBD", "Switchboard", []],
    ["ATS", "Automatic transfer switch", []],
    ["GEN", "Generator", []],
    ["MCC", "Motor control center", []],
  ],
};

const SEEDS = new Map(ELECTRICAL_DEFAULTS.map((d) => [d.finish_tag, d]));

function build() {
  const out = [];
  for (const [category, rows] of Object.entries(CATALOG)) {
    rows.forEach(([tag, desc, lines, opts], i) => {
      const seed = SEEDS.get(tag);
      const measure = opts?.measure || "count";
      const base = seed
        ? { ...seed, materials: seed.materials.map((m) => ({ ...m })) }          // same color, hatch, waste and materials as a fresh project's
        : { finish_tag: tag, color: COLOR[category], hatch: HATCH[i % HATCH.length], waste_pct: measure === "linear" ? 5 : 0, materials: (lines || []).map(line) };
      out.push({ ...base, category, desc, measure, seed: false });
    });
  }
  return out;
}

/** Fresh copies of every starter item, so a caller can never mutate the catalog. */
export const deviceCatalog = () => build();

/** The starter items whose tag isn't in `have` (compared case-insensitively, trimmed). */
export function missingStarters(have) {
  const norm = (s) => String(s || "").trim().toUpperCase();
  const taken = new Set([...have].map(norm));
  return build().filter((t) => !taken.has(norm(t.finish_tag)));
}

/** The starter group for a tag, or "" — the default when saving a condition of that name to the chest. */
export const starterCategory = (tag) => {
  const norm = (x) => String(x || "").trim().toUpperCase();
  return build().find((t) => norm(t.finish_tag) === norm(tag))?.category || "";
};
