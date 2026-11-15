// SymbolOptions — the window that opens after you box one symbol with the
// Symbol tool (autocount), before anything is searched: count turned copies
// too (receptacles on vertical and horizontal walls), mirrored copies, and the
// match threshold — at or above it a copy counts; a band just below it comes
// back as a "?" to answer. Answers are remembered per browser by the caller.
//
// Contract:
//   <SymbolOptions itemTag sheetName sheetId opts={{ rotations, mirror, pct, scope, split }}
//                  areas noBreakouts onNoBreakouts(bool) onDeleteArea(id) onDrawAreas()
//                  onFind(opts) onCancel onMenuDepth />
// Where to count: this sheet or all pages, as one total or split by breakout
// area. Find stays disabled until breakout areas are drawn or "This job has no
// breakout areas" is ticked (lib/breakouts.js autocountGate).
import React, { useEffect, useState } from "react";
import { Z } from "../lib/ui.js";
import { autocountGate, areasOn } from "../lib/breakouts.js";

const SCOPES = [
  { scope: "sheet", split: "one", label: "This sheet — one total" },
  { scope: "sheet", split: "areas", label: "This sheet — by breakout area" },
  { scope: "all", split: "one", label: "All pages — one total" },
  { scope: "all", split: "areas", label: "All pages — by breakout area" },
];

const row = { display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", lineHeight: 1.4 };

export default function SymbolOptions({ itemTag = "", sheetName = "", sheetId = "", opts, areas = [], noBreakouts = false, onNoBreakouts, onDeleteArea, onDrawAreas, onFind, onCancel, onMenuDepth }) {
  const [o, setO] = useState({ scope: "sheet", split: "one", ...opts });
  const gate = autocountGate({ areas, noBreakouts, sheetId, scope: o.scope, split: o.split });
  const here = areasOn(areas, sheetId);
  const sheetsWithAreas = new Set(areas.map((a) => a.sheet_id)).size;
  // pause the single-letter shortcuts while the window is up (a toolbar-menu equivalent)
  useEffect(() => { onMenuDepth?.(true); return () => onMenuDepth?.(false); }, [onMenuDepth]);
  const pct = Math.min(100, Math.max(50, Math.round(Number(o.pct) || 92)));
  const askFrom = Math.round(Math.min(75, pct - 5));
  const find = () => { if (gate.ok) onFind({ ...o, pct }); };
  const onKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); find(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
  };
  return (
    <div role="dialog" aria-label="Count this symbol" onKeyDown={onKeyDown}
      style={{ position: "fixed", left: "50%", top: "calc(var(--topbar-h, 56px) + 24px)", transform: "translateX(-50%)", width: 400, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 120px)", overflowY: "auto", zIndex: Z.modal, background: "var(--paper-bright)", border: "1px solid var(--cobalt)", boxShadow: "var(--shadow-pop)", fontSize: 13 }}>
      <div style={{ padding: "10px 14px", background: "var(--cobalt)", color: "var(--accent-contrast)", fontWeight: 700 }}>
        Count this symbol{itemTag ? ` as ${itemTag}` : ""}
      </div>
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={row}>
          <input type="checkbox" checked={o.rotations !== false} onChange={(e) => setO({ ...o, rotations: e.target.checked })} style={{ marginTop: 3 }} />
          <span><b>Include turned copies</b><br /><span style={{ color: "var(--ink-secondary)", fontSize: 12 }}>The same device on horizontal and vertical walls — 90°, 180° and 270°.</span></span>
        </label>
        <label style={row}>
          <input type="checkbox" checked={o.mirror !== false} onChange={(e) => setO({ ...o, mirror: e.target.checked })} style={{ marginTop: 3 }} />
          <span><b>Include mirrored copies</b><br /><span style={{ color: "var(--ink-secondary)", fontSize: 12 }}>Flipped left-for-right, like a device on the opposite face of a wall.</span></span>
        </label>
        <label style={{ ...row, alignItems: "center" }}>
          <b style={{ flex: 1 }}>Count a copy when it matches at least</b>
          <input name="symbol-threshold" type="number" min="50" max="100" step="1" value={o.pct} autoFocus
            onChange={(e) => setO({ ...o, pct: e.target.value })}
            style={{ width: 56, padding: "3px 6px", border: "1px solid var(--ink-faint)", fontFamily: "var(--f-mono)", fontSize: 13 }} />
          <span>%</span>
        </label>
        <div style={{ fontSize: 12, color: "var(--ink-secondary)", lineHeight: 1.45 }}>
          {askFrom}–{pct - 1}% matches come back as <b>?</b> for you to accept or dismiss; below {askFrom}% they're left out. 75% is the default because real sheets put walls, text and hatch behind the symbols; raise it when similar symbols get caught.
        </div>
        <div style={{ borderTop: "1px solid var(--ink-faint)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <b>Where to count</b>
          {SCOPES.map((sc) => {
            const g = autocountGate({ areas, noBreakouts, sheetId, scope: sc.scope, split: sc.split });
            const on = o.scope === sc.scope && o.split === sc.split;
            const blockedByAreas = sc.split === "areas" && !g.ok;
            return (
              <label key={sc.label} style={{ ...row, alignItems: "center", opacity: blockedByAreas ? 0.5 : 1 }}>
                <input type="radio" name="symbol-scope" checked={on} disabled={blockedByAreas} onChange={() => setO({ ...o, scope: sc.scope, split: sc.split })} />
                <span>{sc.label}</span>
              </label>
            );
          })}
          <div style={{ fontSize: 12, color: "var(--ink-secondary)" }}>
            Breakout areas: {here.length ? `${here.map((a) => a.name).join(", ")} on ${sheetName || "this sheet"}` : `none on ${sheetName || "this sheet"}`}{sheetsWithAreas ? ` · ${areas.length} on ${sheetsWithAreas} sheet${sheetsWithAreas === 1 ? "" : "s"}` : ""}
          </div>
          {here.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {here.map((a) => (
                <span key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 6px", border: "1px solid #7c3aed", color: "#7c3aed", fontSize: 11.5 }}>
                  {a.name}<button type="button" onClick={() => onDeleteArea(a.id)} title={`Remove the breakout area ${a.name}`} style={{ border: "none", background: "none", color: "#7c3aed", cursor: "pointer", padding: 0 }}>✕</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" className="btn-ghost" onClick={onDrawAreas} style={{ padding: "4px 10px" }}>Draw breakout areas (B)</button>
            <label style={{ ...row, alignItems: "center", fontSize: 12.5 }}>
              <input type="checkbox" checked={noBreakouts} disabled={areas.length > 0} onChange={(e) => onNoBreakouts(e.target.checked)} />
              <span>This job has no breakout areas</span>
            </label>
          </div>
          {!gate.ok && <div style={{ fontSize: 12, color: "var(--c-danger)", fontWeight: 600 }}>{gate.reason}</div>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderTop: "1px solid var(--ink-faint)" }}>
        <button type="button" className="btn-primary" onClick={find} disabled={!gate.ok} title={gate.ok ? "" : gate.reason} style={{ flex: 1, justifyContent: "center", opacity: gate.ok ? 1 : 0.45, cursor: gate.ok ? "pointer" : "not-allowed" }}>Find all (⏎)</button>
        <button type="button" className="btn-ghost" onClick={onCancel} style={{ justifyContent: "center" }}>Cancel (Esc)</button>
      </div>
    </div>
  );
}
