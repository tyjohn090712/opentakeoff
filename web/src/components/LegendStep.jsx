// LegendStep — the guided autocount panel (electrical fork): one legend item
// at a time. It shows the item's legend symbol and the best copy it found on
// the discipline's sheets (ringed on the plan). The estimator confirms that
// copy (⏎) or boxes the right one, autocount runs on every sheet of the
// discipline, they review and commit, and the next item comes up.
//
// Contract:
//   <LegendStep step={{ i, n, name, description, discipline }} segs rect
//               status="searching"|"proposed"|"none"|"reviewing"
//               proposal={{ sheetName, score }} done={[{ name, n }]}
//               onUse onBox onSkip onStop />
import React from "react";
import { SymbolThumb } from "./LegendReview.jsx";
import { Z } from "../lib/ui.js";

export default function LegendStep({ step, segs, rect, status, proposal, done = [], onUse, onBox, onSkip, onStop }) {
  const btn = { padding: "5px 10px", justifyContent: "center" };
  return (
    <div role="region" aria-label="Legend autocount" style={{ position: "fixed", left: 340, bottom: "calc(var(--status-h, 28px) + 12px)", width: 340, zIndex: Z.popover, background: "var(--paper-cream)", border: "1px solid var(--cobalt)", boxShadow: "var(--shadow-pop)", fontSize: 12.5 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--ink-faint)" }}>
        <span className="field-label">LEGEND AUTOCOUNT</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--f-mono)" }}>item {Math.min(step.i + 1, step.n)} of {step.n}{step.discipline ? ` · ${step.discipline} sheets` : ""}</span>
      </div>
      <div style={{ display: "flex", gap: 10, padding: "10px 12px", alignItems: "center" }}>
        <SymbolThumb segs={segs} rect={rect} size={48} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "var(--f-mono)", fontWeight: 700 }}>{step.name}</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-secondary)" }}>{step.description}</div>
        </div>
      </div>
      <div style={{ padding: "0 12px 10px", lineHeight: 1.45 }}>
        {status === "searching" && <span>Looking for it on the sheets…</span>}
        {status === "proposed" && <span>Best copy: <b>{proposal?.sheetName}</b> at {Math.round((proposal?.score || 0) * 100)}% — ringed on the plan. Is that this device?</span>}
        {status === "none" && <span style={{ color: "var(--c-warning)" }}>No copy close enough to propose. Box one on the plan, or skip it if this job doesn't use it.</span>}
        {status === "reviewing" && <span>Review the finds and <b>Commit</b>; the next item comes up after.</span>}
      </div>
      <div style={{ display: "flex", gap: 6, padding: "0 12px 10px", flexWrap: "wrap" }}>
        {status === "proposed" && <button type="button" className="btn-primary" onClick={onUse} style={{ ...btn, flex: 1 }}>Use this copy (⏎)</button>}
        {status !== "reviewing" && <button type="button" className="btn-ghost" onClick={onBox} style={btn}>Box it myself (Y)</button>}
        {status !== "reviewing" && <button type="button" className="btn-ghost" onClick={onSkip} style={btn}>Skip</button>}
        <button type="button" className="btn-ghost" onClick={onStop} style={btn}>Stop</button>
      </div>
      {done.length > 0 && (
        <div style={{ padding: "6px 12px 8px", borderTop: "1px solid var(--ink-faint)", fontSize: 11.5, color: "var(--ink-secondary)", maxHeight: 90, overflowY: "auto" }}>
          {done.map((d, k) => <div key={k}>✓ {d.name} — {d.n} EA</div>)}
        </div>
      )}
    </div>
  );
}
