// LegendReview — the guided autocount step's first screen (electrical fork):
// every row the legend reader found, one line per item (a row with EMERGENCY |
// NORMAL symbols is two items), with its drawn symbol, the description, its
// section and the suggested kind. The estimator ticks what to take off, fixes
// names and kinds, picks the discipline whose sheets get counted, and starts.
// Nothing is created until "Create … and start".
//
// Contract:
//   <LegendReview entries segs disciplines discipline sheetName
//                 onCreate({ entries, discipline }) onCancel onMenuDepth />
// entries: [{ id, section, description, variant, kind, include, name, rect, reason, existing }]
// segs: the legend sheet's flat segment array (thumbnails are drawn from it)
import React, { useEffect, useMemo, useState } from "react";
import { Z } from "../lib/ui.js";

const KINDS = [{ id: "count", label: "Count" }, { id: "run", label: "Run" }, { id: "skip", label: "Skip" }];

// the drawn symbol, from the legend sheet's own segments inside its cell
function SymbolThumb({ segs, rect, size = 34 }) {
  const lines = useMemo(() => {
    const out = [];
    if (!segs || !rect) return out;
    const [[x0, y0], [x1, y1]] = rect;
    for (let i = 0; i + 3 < segs.length; i += 4) {
      const a = segs[i], b = segs[i + 1], c = segs[i + 2], d = segs[i + 3];
      if (Math.min(a, c) >= x0 && Math.max(a, c) <= x1 && Math.min(b, d) >= y0 && Math.max(b, d) <= y1) out.push([a, b, c, d]);
      if (out.length > 400) break;
    }
    return out;
  }, [segs, rect]);
  if (!rect) return <span style={{ width: size, height: size, display: "inline-block" }} />;
  const [[x0, y0], [x1, y1]] = rect;
  const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0), pad = Math.max(w, h) * 0.1;
  return (
    <svg width={size} height={size} viewBox={`${x0 - pad} ${y0 - pad} ${w + 2 * pad} ${h + 2 * pad}`} style={{ flexShrink: 0, background: "#fff", border: "1px solid var(--ink-faint)" }}>
      {lines.map(([a, b, c, d], i) => <line key={i} x1={a} y1={b} x2={c} y2={d} stroke="#111" strokeWidth={Math.max(w, h) / 40} strokeLinecap="round" />)}
    </svg>
  );
}

export { SymbolThumb };

export default function LegendReview({ entries: initial = [], segs, disciplines = [], discipline: initialDisc = "", sheetName = "", onCreate, onCancel, onMenuDepth }) {
  const [entries, setEntries] = useState(initial);
  const [discipline, setDiscipline] = useState(initialDisc || disciplines[0] || "");
  const [showSkipped, setShowSkipped] = useState(false);
  useEffect(() => { onMenuDepth?.(true); return () => onMenuDepth?.(false); }, [onMenuDepth]);
  const set = (id, patch) => setEntries((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const shown = entries.filter((e) => showSkipped || e.kind !== "skip");
  const picked = entries.filter((e) => e.include && e.kind !== "skip");
  const counts = picked.filter((e) => e.kind === "count").length, runs = picked.filter((e) => e.kind === "run").length;
  const skipped = entries.filter((e) => e.kind === "skip").length;
  let lastSection = null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: Z.modal }} onPointerDown={onCancel}>
      <div role="dialog" aria-label="Legend autocount — review the legend" onPointerDown={(e) => e.stopPropagation()}
        style={{ width: 860, maxWidth: "calc(100vw - 32px)", height: "86vh", display: "flex", flexDirection: "column", background: "var(--paper-bright)", border: "1px solid var(--cobalt)", boxShadow: "var(--shadow-pop)", fontSize: 12.5 }}>
        <div style={{ padding: "10px 14px", background: "var(--cobalt)", color: "var(--accent-contrast)", display: "flex", gap: 10, alignItems: "baseline" }}>
          <b>Legend autocount — {entries.length} legend item{entries.length === 1 ? "" : "s"} read{sheetName ? ` from ${sheetName}` : ""}</b>
        </div>
        <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--ink-faint)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <b>Count on</b>
            <select name="legend-discipline" value={discipline} onChange={(e) => setDiscipline(e.target.value)} style={{ padding: "3px 6px" }}>
              {disciplines.map((d) => <option key={d} value={d}>{d} sheets</option>)}
              <option value="">every sheet</option>
            </select>
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={showSkipped} onChange={(e) => setShowSkipped(e.target.checked)} />
            Show {skipped} skipped row{skipped === 1 ? "" : "s"} (notes, abbreviations, one-line symbols)
          </label>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={() => setEntries((es) => es.map((e) => ({ ...e, include: e.kind !== "skip" })))} style={{ padding: "3px 8px" }}>All</button>
          <button type="button" className="btn-ghost" onClick={() => setEntries((es) => es.map((e) => ({ ...e, include: false })))} style={{ padding: "3px 8px" }}>None</button>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {shown.length === 0 && <div style={{ padding: 14, color: "var(--ink-muted)" }}>No legend rows in that box. Box the legend table itself — symbols with their descriptions beside them.</div>}
          {shown.map((e) => {
            const head = e.section !== lastSection ? (lastSection = e.section, true) : false;
            return (
              <React.Fragment key={e.id}>
                {head && <div style={{ position: "sticky", top: 0, zIndex: 1, padding: "5px 14px", background: "var(--paper)", borderTop: "1px solid var(--ink-faint)", fontWeight: 700, fontSize: 11.5 }}>{e.section || "No section heading"}</div>}
                <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "5px 14px", borderTop: "1px solid var(--ink-faint)", opacity: e.kind === "skip" ? 0.55 : 1 }}>
                  <input type="checkbox" checked={!!e.include && e.kind !== "skip"} disabled={e.kind === "skip"} onChange={(ev) => set(e.id, { include: ev.target.checked })} aria-label={`Take off ${e.name}`} />
                  <SymbolThumb segs={segs} rect={e.rect} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input value={e.name} onChange={(ev) => set(e.id, { name: ev.target.value })} aria-label="Item name"
                        style={{ fontFamily: "var(--f-mono)", fontWeight: 600, fontSize: 12, padding: "1px 4px", border: "1px solid var(--ink-faint)", width: 260 }} />
                      {e.variant && <span style={{ fontSize: 10.5, color: "var(--cobalt)", border: "1px solid var(--cobalt)", padding: "0 4px" }}>{e.variant}</span>}
                      {e.existing && <span style={{ fontSize: 10.5, color: "var(--c-positive)" }}>already in this takeoff</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={`${e.description}\n${e.reason}`}>{e.description}</div>
                  </div>
                  <select value={e.kind} onChange={(ev) => set(e.id, { kind: ev.target.value, include: ev.target.value !== "skip" })} aria-label="Kind" title={e.reason} style={{ padding: "2px 4px" }}>
                    {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </select>
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderTop: "1px solid var(--ink-faint)", alignItems: "center" }}>
          <span style={{ flex: 1, color: "var(--ink-secondary)" }}>{counts} to count{runs ? ` · ${runs} run${runs === 1 ? "" : "s"} to trace` : ""} · items are added to the takeoff, then counted one at a time</span>
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!picked.length} onClick={() => onCreate({ entries: picked, discipline })} style={{ opacity: picked.length ? 1 : 0.45 }}>
            Create {picked.length} item{picked.length === 1 ? "" : "s"} and start counting
          </button>
        </div>
      </div>
    </div>
  );
}
