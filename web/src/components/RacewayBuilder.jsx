// RacewayBuilder — the "+ raceway" dialog. Pick what the run IS the way the
// estimating system names it — raceway type, trade size, conductors, what it
// mounts to — and get a ready LINEAR condition ("3/4 EMT 3-#10 CONC") to trace
// with. Hundreds of combinations exist, so nothing is pre-seeded: a project
// holds only the ones picked. The pure half (names, lines, validation) is
// lib/raceway.ts.
//
// Contract:
//   <RacewayBuilder existingTags={Set<normalized tag>} normalize={fn}
//                   onCreate(spec) onClose />
import React, { useMemo, useState } from "react";
import { Icon } from "../brand/icons.jsx";
import {
  RACEWAY_TYPES, TRADE_SIZES, WIRE_SIZES, MOUNTINGS, MAX_CONDUCTORS,
  racewayName, racewayLabel, racewayProblem, racewayTemplate,
} from "../lib/raceway";

const LAST_KEY = "opentakeoff_raceway_last";
const DEFAULT = { type: "EMT", size: "3/4", count: 3, wire: "12", ground: "", mount: "CONC" };

// the last pick comes back next time (a per-estimator convenience only — every
// read and write is guarded; storage can be blocked or empty)
function lastPick() {
  try {
    const s = JSON.parse(localStorage.getItem(LAST_KEY) || "null");
    return s && !racewayProblem({ ...DEFAULT, ...s, ground: s.ground || null }) ? { ...DEFAULT, ...s, ground: s.ground || "" } : DEFAULT;
  } catch { return DEFAULT; }
}

export default function RacewayBuilder({ existingTags = new Set(), normalize = (s) => s, onCreate, onClose }) {
  const [spec, setSpec] = useState(lastPick);
  const set = (patch) => setSpec((s) => ({ ...s, ...patch }));

  const clean = useMemo(() => ({ ...spec, ground: spec.ground || null }), [spec]);
  const problem = racewayProblem(clean);
  const name = problem ? "" : racewayName(clean);
  const taken = !!name && existingTags.has(normalize(name));
  const lines = useMemo(() => (problem ? [] : racewayTemplate(clean, "#000").materials), [clean, problem]);

  const create = () => {
    if (problem) return;
    try { localStorage.setItem(LAST_KEY, JSON.stringify(clean)); } catch { /* storage unavailable — the pick just isn't remembered */ }
    onCreate(clean);
  };

  const lbl = { fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-muted)" };
  const mono = { fontFamily: "var(--f-mono)", fontVariantNumeric: "tabular-nums" };
  const sel = { fontSize: 13, padding: "4px 6px", border: "1px solid var(--ink-faint)", background: "var(--paper-bright)", color: "var(--ink)" };
  const field = (label, child) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}><span style={lbl}>{label}</span>{child}</label>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 520, maxWidth: "calc(100vw - 32px)", maxHeight: "86vh", display: "flex", flexDirection: "column", background: "var(--paper-bright)", border: "1px solid var(--cobalt)", boxShadow: "var(--shadow-pop)", fontSize: 12.5 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--ink-faint)", background: "var(--cobalt)", color: "var(--accent-contrast)" }}>
          <span style={{ fontWeight: 700 }}>Add a raceway run</span>
          <button onClick={onClose} title="Close" style={{ background: "transparent", border: "none", color: "var(--accent-contrast)", cursor: "pointer", display: "inline-flex" }}><Icon name="close" size={14} /></button>
        </div>

        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12, overflow: "auto" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {field("Raceway", (
              <select name="raceway-type" value={spec.type} onChange={(e) => set({ type: e.target.value })} style={sel}>
                {RACEWAY_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            ))}
            {field("Trade size", (
              <select name="raceway-size" value={spec.size} onChange={(e) => set({ size: e.target.value })} style={{ ...sel, ...mono }}>
                {TRADE_SIZES.map((s) => <option key={s} value={s}>{s}″</option>)}
              </select>
            ))}
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            {field("Conductors", (
              <input name="raceway-count" type="number" min={0} max={MAX_CONDUCTORS} step={1} value={spec.count}
                onChange={(e) => set({ count: e.target.value === "" ? "" : Math.floor(Number(e.target.value)) })}
                style={{ ...sel, ...mono, width: 64 }} />
            ))}
            {field("Wire", (
              <select name="raceway-wire" value={spec.wire} disabled={spec.count === 0} onChange={(e) => set({ wire: e.target.value })} style={{ ...sel, ...mono }}>
                {WIRE_SIZES.map((w) => <option key={w} value={w}>{Number(w) >= 250 ? `${w} kcmil` : `#${w}`}</option>)}
              </select>
            ))}
            {field("Ground", (
              <select name="raceway-ground" value={spec.ground} disabled={spec.count === 0} onChange={(e) => set({ ground: e.target.value })} style={{ ...sel, ...mono }}
                title="Leave on “in the count” when the ground is one of the conductors above; pick a size to add a separate ground">
                <option value="">in the count</option>
                {WIRE_SIZES.map((w) => <option key={w} value={w}>+ {Number(w) >= 250 ? `${w} kcmil` : `#${w}`}</option>)}
              </select>
            ))}
            <span style={{ ...lbl, paddingBottom: 6 }}>0 conductors = an empty raceway</span>
          </div>

          <div>
            <div style={{ ...lbl, marginBottom: 4 }}>Mounts to</div>
            <div role="radiogroup" aria-label="Mounts to" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {MOUNTINGS.map((m) => {
                const on = spec.mount === m.id;
                return (
                  <button key={m.id} role="radio" aria-checked={on} onClick={() => set({ mount: m.id })}
                    style={{ padding: "6px 12px", border: `1px solid ${on ? "var(--ink)" : "var(--ink-faint)"}`, background: on ? "var(--ink)" : "transparent", color: on ? "var(--paper-bright)" : "var(--ink)", cursor: "pointer", fontSize: 12.5, fontWeight: on ? 700 : 400 }}>
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--ink-faint)", paddingTop: 10 }}>
            {problem ? (
              <div style={{ color: "var(--c-danger)" }}>{problem}</div>
            ) : (
              <>
                <div style={{ ...mono, fontWeight: 700, fontSize: 15 }}>{name}</div>
                <div style={{ color: "var(--ink-muted)", marginTop: 2 }}>{racewayLabel(clean)}</div>
                <div style={{ ...lbl, marginTop: 8 }}>Buy list from the footage you trace</div>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, ...mono, fontSize: 11.5, lineHeight: 1.6 }}>
                  {lines.map((m) => (
                    <li key={m.name}>{m.name} — {m.mult && m.mult !== 1 ? `${m.mult} ${m.unit} per LF` : m.unit === "ea" ? `1 per ${m.per} LF` : `1 ${m.unit} per LF`}</li>
                  ))}
                </ul>
                <div style={{ color: "var(--ink-muted)", fontSize: 11, marginTop: 6 }}>
                  Supports and labor for {MOUNTINGS.find((m) => m.id === spec.mount)?.label.toLowerCase()} come from your estimating system's assembly — they aren't guessed here.
                </div>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "10px 14px", borderTop: "1px solid var(--ink-faint)" }}>
          {taken && <span style={{ ...lbl, marginRight: "auto", color: "var(--c-warning)" }}>already in this takeoff — selects it</span>}
          <button onClick={onClose} style={{ padding: "7px 12px", border: "1px solid var(--ink-faint)", background: "transparent", color: "var(--ink)", cursor: "pointer", fontSize: 12 }}>Cancel</button>
          <button onClick={create} disabled={!!problem}
            style={{ padding: "8px 16px", border: "none", background: problem ? "var(--text-faint)" : "var(--ink)", color: "var(--paper-bright)", cursor: problem ? "default" : "pointer", fontWeight: 700, fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {taken ? "Select it" : "Add run"}
          </button>
        </div>
      </div>
    </div>
  );
}
