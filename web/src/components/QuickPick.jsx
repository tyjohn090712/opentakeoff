// QuickPick — the item search (electrical fork). A Space tap (or /) opens it
// over the plan: type part of a tag, a description, a group or an Est. code,
// ↑/↓ to move, ⏎ to take off that item. The project's items list first; a
// chest item the project doesn't have yet is added when picked. Either way the
// item's own tool is armed by the caller, so the next click measures it.
//
// Contract:
//   <QuickPick conditions templates measureOf={(c) => "count"|"linear"|"area"|null}
//              qtyOf={(c) => string} onPickCondition(id) onPickTemplate(t) onClose />
// The ranking is lib/chest.js quickPickResults (pure, tested).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { HatchSwatch } from "./hatches.jsx";
import { quickPickResults, templateCategory, measureTool } from "../lib/chest.js";
import { Z } from "../lib/ui.js";

const MEASURE_LABEL = { count: "Count", linear: "Run", area: "Area" };

export default function QuickPick({ conditions = [], templates = [], measureOf = () => null, qtyOf = () => "", onPickCondition, onPickTemplate, onClose }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef(null);
  const rows = useMemo(() => quickPickResults(conditions, templates, q), [conditions, templates, q]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-row="${sel}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const pick = (r) => {
    if (!r) return;
    if (r.kind === "project") onPickCondition(r.c.id);
    else onPickTemplate(r.t);
    onClose();
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(rows.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(rows[sel]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  const chestStarts = rows.findIndex((r) => r.kind === "chest");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.18)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "12vh", zIndex: Z.modal }}
      onPointerDown={onClose}>
      <div role="dialog" aria-label="Pick an item to take off" onPointerDown={(e) => e.stopPropagation()}
        style={{ width: 560, maxWidth: "calc(100vw - 32px)", maxHeight: "70vh", display: "flex", flexDirection: "column", background: "var(--paper-bright)", border: "1px solid var(--cobalt)", boxShadow: "var(--shadow-pop)", fontSize: 13 }}>
        <input name="quick-pick" autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
          placeholder="Find an item — “gfci”, “strobe”, “3/4 emt”, an Est. code…"
          style={{ padding: "12px 14px", border: "none", borderBottom: "1px solid var(--ink-faint)", background: "var(--paper-bright)", color: "var(--ink)", fontSize: 15, outline: "none" }} />
        <div ref={listRef} style={{ overflow: "auto" }}>
          {rows.length === 0 && (
            <div style={{ padding: "12px 14px", color: "var(--ink-muted)" }}>
              {q ? `Nothing in this takeoff or the chest matches “${q}”.` : "No items yet — type to search the chest."}
            </div>
          )}
          {rows.map((r, i) => {
            const it = r.kind === "project" ? r.c : r.t;
            const m = r.kind === "project" ? measureOf(r.c) : measureTool(r.t);
            const on = i === sel;
            return (
              <React.Fragment key={`${r.kind}-${r.kind === "project" ? r.c.id : r.idx}`}>
                {(i === 0 || i === chestStarts) && (
                  <div style={{ padding: "6px 14px 3px", fontFamily: "var(--f-mono)", fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--ink-muted)", background: "var(--paper)" }}>
                    {r.kind === "project" ? "In this takeoff" : "From the chest — added when picked"}
                  </div>
                )}
                <div data-row={i} onPointerEnter={() => setSel(i)} onClick={() => pick(r)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 14px", cursor: "pointer", background: on ? "var(--surface-pop)" : "transparent", borderLeft: on ? "3px solid var(--cobalt)" : "3px solid transparent" }}>
                  <span style={{ borderRadius: 4, overflow: "hidden", lineHeight: 0, flexShrink: 0 }}><HatchSwatch type={it.hatch || "solid"} line={it.color} fill={it.fill ?? it.color} /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontWeight: 700, color: "var(--ink)", fontFamily: "var(--f-mono)", whiteSpace: "nowrap" }}>{it.finish_tag}</span>
                      {it.desc && <span style={{ color: "var(--ink-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.desc}</span>}
                    </div>
                    {r.kind === "chest" && <div style={{ fontSize: 11, color: "var(--ink-muted)" }}>{templateCategory(r.t)}</div>}
                  </div>
                  {r.kind === "project" && <span style={{ fontFamily: "var(--f-mono)", fontSize: 11.5, color: "var(--ink-secondary)", whiteSpace: "nowrap" }}>{qtyOf(r.c)}</span>}
                  {m && <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--cobalt)", border: "1px solid var(--cobalt)", padding: "1px 5px", flexShrink: 0 }}>{MEASURE_LABEL[m]}</span>}
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div style={{ padding: "6px 14px", borderTop: "1px solid var(--ink-faint)", fontSize: 11, color: "var(--ink-muted)", fontFamily: "var(--f-mono)" }}>
          ↑↓ move · ⏎ take off · Esc close · Space mid-run adds an adder
        </div>
      </div>
    </div>
  );
}
