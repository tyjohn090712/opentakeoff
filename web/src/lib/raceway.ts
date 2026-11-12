// Raceway builder (electrical fork, Wave 3 — the configuration library).
//
// An estimator prices a run as ONE assembly — "3/4 EMT, 3 #10, on concrete" —
// the way the Accubid system list names it, not as a conduit condition plus a
// ×N multiplier. This module is the pure half: turn a picked spec (type, trade
// size, conductors, mounting) into the condition template the canvas
// instantiates. Hundreds of combinations exist, so none are pre-seeded; the
// builder dialog makes the one you pick and the project (and the Library, on
// request) keeps only what has been used.
//
// The conductor count lives on the wire LINE (`mult`: 3 per LF of raceway), not
// on the condition's ×N — that multiplier also scales the raceway footage
// (a ×7 on 100 LF reported 700 LF of conduit). Mounting (concrete, steel, wood,
// t-rod, strut) only selects the assembly: its labor and supports are priced in
// the estimating system, so no support quantities are guessed here.
//
// The name format is centralized in `racewayName` — match it to the estimating
// system's item names in ONE place.

export const RACEWAY_TYPES = [
  { id: "EMT", label: "EMT", stick: true },
  { id: "RGS", label: "Rigid steel (RGS)", stick: true },
  { id: "IMC", label: "IMC", stick: true },
  { id: "PVC", label: "PVC Sch 40", stick: true },
  { id: "FMC", label: "Flex (FMC)", stick: false },
  { id: "LFMC", label: "Liquidtight flex (LFMC)", stick: false },
] as const;

export const TRADE_SIZES = ["1/2", "3/4", "1", "1-1/4", "1-1/2", "2", "2-1/2", "3", "3-1/2", "4"] as const;

// copper building wire, small to large; "250" and up are kcmil
export const WIRE_SIZES = ["14", "12", "10", "8", "6", "4", "3", "2", "1", "1/0", "2/0", "3/0", "4/0", "250", "300", "350", "400", "500", "600", "750"] as const;

export const MOUNTINGS = [
  { id: "CONC", label: "Concrete" },
  { id: "STEEL", label: "Steel" },
  { id: "WOOD", label: "Wood" },
  { id: "T-ROD", label: "T-rod" },
  { id: "STRUT", label: "Strut" },
] as const;

export const MAX_CONDUCTORS = 60;
const STICK_LF = 10;   // EMT, rigid, IMC and PVC conduit all ship in 10 ft lengths

export type RacewaySpec = {
  type: string;                // RACEWAY_TYPES id
  size: string;                // TRADE_SIZES entry
  count: number;               // conductors of `wire`; 0 = an empty raceway (pull string)
  wire: string;                // WIRE_SIZES entry (ignored when count is 0)
  ground?: string | null;      // an extra, separately sized ground conductor — omit when the ground is in `count`
  mount: string;               // MOUNTINGS id
};

const has = (list: readonly (string | { id: string })[], v: string) => list.some((x) => (typeof x === "string" ? x : x.id) === v);

/** The reason a spec can't be built, or null when it can. */
export function racewayProblem(s: Partial<RacewaySpec> | null | undefined): string | null {
  if (!s) return "No raceway picked.";
  if (!has(RACEWAY_TYPES, String(s.type))) return "Pick a raceway type.";
  if (!has(TRADE_SIZES, String(s.size))) return "Pick a trade size.";
  if (!has(MOUNTINGS, String(s.mount))) return "Pick what it mounts to.";
  const n = s.count;
  if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > MAX_CONDUCTORS) return `Conductors must be a whole number from 0 to ${MAX_CONDUCTORS}.`;
  if ((n as number) > 0 && !has(WIRE_SIZES, String(s.wire))) return "Pick a wire size.";
  if (s.ground != null && s.ground !== "" && !has(WIRE_SIZES, String(s.ground))) return "Pick a ground wire size.";
  if ((n as number) === 0 && s.ground) return "A ground needs conductors to ride with.";
  return null;
}

// "#10", "#1/0" for AWG; "250K" for kcmil
const wireTok = (w: string) => (Number(w) >= 250 ? `${w}K` : `#${w}`);
// "THHN #10", "THHN 250 kcmil"
const wireLabel = (w: string) => `THHN ${Number(w) >= 250 ? `${w} kcmil` : `#${w}`}`;

/** "3/4 EMT 3-#10 CONC", "1 EMT 4-#10 +#10G STEEL", "3/4 EMT EMPTY WOOD". */
export function racewayName(s: RacewaySpec): string {
  const wires = s.count > 0 ? `${s.count}-${wireTok(s.wire)}${s.ground ? ` +${wireTok(s.ground)}G` : ""}` : "EMPTY";
  return `${s.size} ${s.type} ${wires} ${s.mount}`;
}

/** The conduit run description without the mounting — what the picker previews. */
export function racewayLabel(s: RacewaySpec): string {
  const t = RACEWAY_TYPES.find((x) => x.id === s.type);
  const m = MOUNTINGS.find((x) => x.id === s.mount);
  const wires = s.count > 0
    ? `${s.count} ${wireTok(s.wire)}${s.ground ? ` + ${wireTok(s.ground)} ground` : ""}`
    : "empty (pull string)";
  return `${s.size}" ${t?.label ?? s.type}, ${wires}, on ${(m?.label ?? s.mount).toLowerCase()}`;
}

/** A stable palette slot for a name, so the same configuration reads the same everywhere. */
export function racewayColorIndex(name: string, n: number): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return n > 0 ? h % n : 0;
}

/**
 * The condition template for a spec: a LINEAR condition (trace it as a run),
 * 5% waste, and the lines the configuration itself determines — conduit sticks
 * (or LF for flex) and each wire at its conductor count per LF. Throws on a
 * spec racewayProblem rejects.
 */
export function racewayTemplate(s: RacewaySpec, color: string) {
  const bad = racewayProblem(s);
  if (bad) throw new Error(bad);
  const t = RACEWAY_TYPES.find((x) => x.id === s.type)!;
  const materials: Record<string, unknown>[] = [];
  materials.push(t.stick
    ? { name: `${s.size} ${s.type} (${STICK_LF} ft)`, per: STICK_LF, basis: "linear", unit: "ea", note: `${STICK_LF} ft lengths` }
    : { name: `${s.size} ${s.type}`, per: 1, basis: "linear", unit: "lf" });
  if (s.count > 0) {
    materials.push({ name: wireLabel(s.wire), kind: "conductor", per: 1, mult: s.count, basis: "linear", unit: "lf", note: `${s.count} conductor${s.count === 1 ? "" : "s"} per LF of raceway` });
  }
  if (s.count > 0 && s.ground) {
    materials.push({ name: `${wireLabel(s.ground)} (ground)`, kind: "conductor", per: 1, mult: 1, basis: "linear", unit: "lf", note: "1 ground conductor per LF of raceway" });
  }
  return { finish_tag: racewayName(s), color, fill: color, hatch: "circuit", waste_pct: 5, materials };
}
