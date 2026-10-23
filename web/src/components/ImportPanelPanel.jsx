// ImportPanelPanel — the approval dialog for "Import panel schedule". The
// estimator drags a box around ONE panelboard's schedule; the parent
// (TakeoffCanvas) reads it — the text layer on a vector sheet, on-device OCR on
// a scan — and hands the parsed panel here. This view is the one human beat:
// name the panel, glance at the circuits, fix a misread trip or pole count,
// resolve the withheld rows (or leave them flagged), Save.
//
// Edits are local until Save. A row's kind follows what's typed: a withheld
// row given a standard trip + pole count becomes a load (or a spare, if its
// description says SPARE); a breaker row whose size stops being a standard
// rating drops back to withheld — the dialog never saves a guess as a count.
//
// Contract:
//   <ImportPanelPanel draft={{ panel, source, sheetLabel }} existingNames={Set}
//                     conditionTags={Set} onSave(panel, { makeCondition }) onClose />
import React, { useMemo, useState } from "react";
import { Icon } from "../brand/icons.jsx";
import { panelTotals, STANDARD_TRIPS } from "../lib/panelSchedule";
import { breakerSummaryText } from "../lib/panelSchedules.js";

const INFO_LABELS = [["volts", "Volts"], ["bus", "Bus"], ["main", "Main"], ["mounting", "Mounting"], ["aic", "AIC"], ["fed_from", "Fed from"], ["location", "Location"]];
const KIND_LABEL = { load: "Load", spare: "Spare", space: "Space", withheld: "Review" };
const isSpare = (d) => /\bSPARE\b/i.test(d || "");

// the kind a row actually saves as, given what's typed in it
function effective(c) {
  if (c.kind === "space") return { ...c, trip: null, poles: null };
  const okTrip = Number.isInteger(c.trip) && STANDARD_TRIPS.has(c.trip);
  const okPoles = Number.isInteger(c.poles) && c.poles >= 1 && c.poles <= 3;
  if (c.kind === "withheld") return okTrip && okPoles && c.resolved ? { ...c, kind: isSpare(c.description) || !c.description ? "spare" : "load", reason: undefined } : c;
  if (okTrip && okPoles) return c;
  return { ...c, kind: "withheld", reason: !okTrip ? "breaker size isn't a standard rating" : "pole count must be 1, 2 or 3" };
}

export default function ImportPanelPanel({ draft, existingNames = new Set(), conditionTags = new Set(), onSave, onClose }) {
  const { panel, source, sheetLabel } = draft;
  const [name, setName] = useState(panel.name || "");
  const [rows, setRows] = useState(() => panel.circuits.map((c, i) => ({ ...c, key: `c${i}` })));
  const [makeCondition, setMakeCondition] = useState(true);

  const nm = name.trim().toUpperCase();
  const pnlTag = nm ? `PNL-${nm}` : "";
  const tagTaken = !!pnlTag && conditionTags.has(pnlTag);
  const replacing = !!nm && existingNames.has(nm);
  const saved = useMemo(() => rows.map(effective), [rows]);
  const totals = useMemo(() => panelTotals(saved), [saved]);

  const edit = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch, resolved: true } : r)));
  const numIn = (v) => { const n = parseInt(String(v).replace(/[^0-9]/g, ""), 10); return Number.isFinite(n) ? n : null; };

  const save = () => {
    if (!nm) return;
    onSave({ ...panel, name: nm, circuits: saved.map(({ key, resolved, ...c }) => c) }, { makeCondition: makeCondition && !tagTaken });
  };

  const lbl = { fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-muted)" };
  const mono = { fontFamily: "var(--f-mono)", fontVariantNumeric: "tabular-nums" };
  const cellIn = { ...mono, fontSize: 12, width: 44, padding: "1px 4px", border: "1px solid var(--ink-faint)", background: "var(--paper-bright)", color: "var(--ink)" };
  const infoBits = INFO_LABELS.filter(([k]) => panel.info?.[k]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: 680, maxWidth: "calc(100vw - 32px)", maxHeight: "min(86vh, 820px)", display: "flex", flexDirection: "column", background: "var(--paper-bright)", border: "1px solid var(--cobalt)", boxShadow: "var(--shadow-pop)", fontSize: 12.5 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--ink-faint)", background: "var(--cobalt)", color: "var(--accent-contrast)" }}>
          <span style={{ fontWeight: 700 }}>
            Panel schedule — {panel.circuits.length} row{panel.circuits.length === 1 ? "" : "s"} read {source === "ocr" ? "from the image (on this computer)" : "from the drawing's text"}
          </span>
          <button onClick={onClose} title="Close" style={{ background: "transparent", border: "none", color: "var(--accent-contrast)", cursor: "pointer", display: "inline-flex" }}><Icon name="close" size={14} /></button>
        </div>

        {/* name + ratings */}
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--ink-faint)", display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={lbl}>Panel</span>
            <input value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} placeholder="name it, e.g. LP-1A"
              style={{ ...mono, fontWeight: 700, fontSize: 14, width: 160, padding: "3px 6px", border: `1px solid ${nm ? "var(--ink-faint)" : "var(--c-danger)"}`, background: "var(--paper-bright)", color: "var(--ink)", textTransform: "uppercase" }} />
            {sheetLabel && <span style={{ ...lbl, opacity: 0.8 }}>on {sheetLabel}</span>}
            {replacing && <span style={{ ...lbl, color: "var(--c-warning)" }}>replaces the {nm} already imported</span>}
          </label>
          {infoBits.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 11.5 }}>
              {infoBits.map(([k, l]) => <span key={k}><span style={lbl}>{l}</span> <span style={mono}>{panel.info[k]}</span></span>)}
            </div>
          )}
          <div style={{ fontSize: 11.5, lineHeight: 1.6 }}>
            <strong style={mono}>{totals.breakerCount}</strong> breaker{totals.breakerCount === 1 ? "" : "s"}
            {totals.breakers.length > 0 && <span style={{ ...mono, color: "var(--ink-muted)" }}> — {breakerSummaryText(totals.breakers)}</span>}
            <br />
            <span style={mono}>{totals.spareCount}</span> spare · <span style={mono}>{totals.spacePositions}</span> space position{totals.spacePositions === 1 ? "" : "s"}
            {totals.withheld > 0 && <> · <strong style={{ ...mono, color: "var(--c-danger)" }}>{totals.withheld} to review</strong> <span style={{ color: "var(--ink-muted)" }}>(not counted until fixed)</span></>}
          </div>
        </div>

        {/* circuits */}
        <div style={{ overflow: "auto", flex: 1 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: "var(--paper)", zIndex: 1 }}>
                {["Ckt", "Description", "Trip A", "Poles", "Kind"].map((h, i) => (
                  <th key={h} style={{ ...lbl, padding: "6px 8px", textAlign: i === 1 ? "left" : "center", borderBottom: "1px solid var(--ink-faint)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const s = saved[i];
                const review = s.kind === "withheld";
                return (
                  <tr key={r.key} style={{ borderBottom: "1px solid var(--ink-faint)", background: review ? "rgba(176,58,38,0.06)" : undefined, boxShadow: review ? "inset 3px 0 0 var(--c-danger)" : undefined }}>
                    <td style={{ ...mono, padding: "4px 8px", textAlign: "center", whiteSpace: "nowrap" }}>{r.ckts.join(",") || "?"}</td>
                    <td style={{ padding: "4px 8px" }}>
                      {r.description || <span style={{ color: "var(--ink-muted)" }}>—</span>}
                      {review && <div style={{ fontSize: 10.5, color: "var(--c-danger)" }}>{s.reason}</div>}
                    </td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>
                      {s.kind === "space" ? <span style={{ color: "var(--ink-muted)" }}>—</span> : (
                        <input value={r.trip ?? ""} onChange={(e) => edit(r.key, { trip: numIn(e.target.value) })} inputMode="numeric" aria-label={`Trip for circuit ${r.ckts.join(",")}`} style={cellIn} />
                      )}
                    </td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>
                      {s.kind === "space" ? <span style={{ color: "var(--ink-muted)" }}>—</span> : (
                        <input value={r.poles ?? ""} onChange={(e) => edit(r.key, { poles: numIn(e.target.value) })} inputMode="numeric" aria-label={`Poles for circuit ${r.ckts.join(",")}`} style={{ ...cellIn, width: 30 }} />
                      )}
                    </td>
                    <td style={{ padding: "4px 6px", textAlign: "center" }}>
                      <select value={r.kind} onChange={(e) => edit(r.key, { kind: e.target.value })} aria-label={`Kind for circuit ${r.ckts.join(",")}`}
                        style={{ fontSize: 11.5, padding: "1px 2px", border: "1px solid var(--ink-faint)", background: "var(--paper-bright)", color: "var(--ink)" }}>
                        {["load", "spare", "space", "withheld"].map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                      </select>
                      {s.kind !== r.kind && !review && <div style={{ ...lbl, fontSize: 8.5 }}>saves as {KIND_LABEL[s.kind]}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "10px 14px", borderTop: "1px solid var(--ink-faint)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginRight: "auto", fontSize: 11.5, opacity: tagTaken || !nm ? 0.6 : 1 }}
            title="A count condition to place this panel on the plan — 1 EA where it's mounted">
            <input type="checkbox" checked={makeCondition && !tagTaken} disabled={tagTaken || !nm} onChange={(e) => setMakeCondition(e.target.checked)} />
            {tagTaken ? <>{pnlTag} is already a condition</> : <>Add a <span style={mono}>{pnlTag || "PNL-…"}</span> count condition</>}
          </label>
          <button onClick={onClose} style={{ padding: "7px 12px", border: "1px solid var(--ink-faint)", background: "transparent", color: "var(--ink)", cursor: "pointer", fontSize: 12 }}>Cancel</button>
          <button onClick={save} disabled={!nm}
            style={{ padding: "8px 16px", border: "none", background: nm ? "var(--ink)" : "var(--text-faint)", color: "var(--paper-bright)", cursor: nm ? "pointer" : "default", fontWeight: 700, fontFamily: "var(--f-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {replacing ? "Replace panel" : "Save panel"}
          </button>
        </div>
      </div>
    </div>
  );
}
