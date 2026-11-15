// ItemList — the always-open item list on the left (electrical fork, layout
// step 2): what you're taking off, LiveCount-style. One line per item: its
// swatch, tag, description, running total, and 1–9 hotkey. A click picks the
// item and arms its tool (the caller's activateCondition); ✎ opens its editor
// (colors, materials, Est. code) in the Takeoffs drawer; the pin puts it on
// a 1–9 hotkey. Grouped by the item's group, filterable, groups collapse.
//
// Contract:
//   <ItemList conditions activeId palette measureOf qtyOf
//             onPick(id) onEdit(id) onTogglePin(id) onFind() onAdd() onRaceway() onCollapse() />
import React, { useMemo, useState } from "react";
import { HatchSwatch } from "./hatches.jsx";
import { Icon } from "../brand/icons.jsx";
import { itemGroups } from "../lib/chest.js";

const TOOL_GLYPH = { count: "EA", linear: "LF", area: "SF" };
const mono = { fontFamily: "var(--f-mono)" };
const footBtn = { flex: 1, padding: "6px 4px", border: "1px dashed var(--ink-faint)", background: "transparent", cursor: "pointer", fontSize: 11.5, color: "var(--ink-muted)", borderRadius: 0 };

export default function ItemList({ conditions = [], activeId = "", palette = [], measureOf = () => null, qtyOf = () => "", onPick, onEdit, onTogglePin, onFind, onAdd, onRaceway, onCollapse }) {
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState(() => new Set());
  const groups = useMemo(() => itemGroups(conditions, q, measureOf), [conditions, q, measureOf]);
  const hotkey = (c) => {
    const i = palette.length ? palette.indexOf(c.id) : conditions.indexOf(c);
    return i >= 0 && i < 9 ? i + 1 : null;
  };
  const searching = q.trim().length > 0;
  return (
    <aside aria-label="Items" style={{ width: 268, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid var(--ink-faint)", background: "var(--paper-bright)", minHeight: 0, overflow: "hidden", fontSize: 12.5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px 6px" }}>
        <span style={{ ...mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--ink-muted)", flex: 1 }}>Items · {conditions.length}</span>
        <button type="button" onClick={onFind} title="Find any item, here or in the chest — tap Space on the plan"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", border: "1px solid var(--cobalt)", background: "transparent", color: "var(--cobalt)", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
          <Icon name="search" size={11} />Space
        </button>
        <button type="button" onClick={onCollapse} title="Hide the item list (the rail's Items button brings it back)" aria-label="Hide the item list"
          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-muted)", padding: 2, display: "inline-flex" }}><Icon name="chevronLeft" size={14} /></button>
      </div>
      <div style={{ padding: "0 10px 6px" }}>
        <input name="item-filter" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); e.currentTarget.blur(); } }}
          placeholder="Filter this takeoff…"
          style={{ width: "100%", boxSizing: "border-box", padding: "5px 8px", border: "1px solid var(--ink-faint)", background: "var(--paper-bright)", color: "var(--ink)", fontSize: 12.5, borderRadius: 0 }} />
      </div>
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {groups.length === 0 && (
          <div style={{ padding: "8px 12px", color: "var(--ink-muted)" }}>{searching ? `No item here matches “${q}”. Space searches the chest too.` : "No items yet — tap Space to find one in the chest."}</div>
        )}
        {groups.map((g) => {
          const shut = !searching && closed.has(g.name);
          return (
            <React.Fragment key={g.name}>
              <div onClick={() => setClosed((s) => { const n = new Set(s); if (n.has(g.name)) n.delete(g.name); else n.add(g.name); return n; })}
                style={{ position: "sticky", top: 0, zIndex: 1, display: "flex", gap: 6, alignItems: "center", padding: "4px 10px", background: "var(--paper)", borderTop: "1px solid var(--ink-faint)", cursor: "pointer", fontSize: 11, color: "var(--ink-muted)", userSelect: "none" }}>
                <span style={{ width: 10 }}>{shut ? "▸" : "▾"}</span>
                <span style={{ fontWeight: 700, color: "var(--ink)" }}>{g.name}</span>
                <span>· {g.items.length}</span>
              </div>
              {!shut && g.items.map((c) => {
                const on = c.id === activeId;
                const m = measureOf(c);
                const hk = hotkey(c);
                const pinned = palette.includes(c.id);
                const qty = qtyOf(c);
                return (
                  <div key={c.id} data-item-id={c.id} onClick={() => onPick(c.id)} onDoubleClick={() => onEdit(c.id)}
                    title={`${c.finish_tag}${c.desc ? ` — ${c.desc}` : ""}\nClick to take it off${m ? ` (arms ${m === "count" ? "Count" : m === "linear" ? "Linear" : "Area"})` : ""} · double-click or ✎ to edit`}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px 5px 7px", cursor: "pointer", borderLeft: on ? `3px solid ${c.color}` : "3px solid transparent", background: on ? "var(--surface-pop)" : "transparent", borderTop: "1px solid var(--ink-faint)" }}>
                    <span style={{ borderRadius: 4, overflow: "hidden", lineHeight: 0, flexShrink: 0 }}><HatchSwatch type={c.hatch || "solid"} line={c.color} fill={c.fill} /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                        <span style={{ ...mono, fontWeight: on ? 700 : 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.finish_tag}</span>
                        {hk && <span title={`Press ${hk}`} style={{ ...mono, fontSize: 9, color: pinned ? "var(--cobalt)" : "var(--ink-muted)", border: `1px solid ${pinned ? "var(--cobalt)" : "var(--ink-faint)"}`, padding: "0 3px", flexShrink: 0 }}>{hk}</span>}
                      </div>
                      {c.desc && <div style={{ fontSize: 11, color: "var(--ink-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.desc}</div>}
                    </div>
                    <span style={{ ...mono, fontSize: 11.5, color: qty ? "var(--ink)" : "var(--ink-muted)", whiteSpace: "nowrap", textAlign: "right" }}>{qty || (m ? `— ${TOOL_GLYPH[m]}` : "—")}</span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); onTogglePin(c.id); }} aria-pressed={pinned}
                      title={pinned ? `Unpin ${c.finish_tag} from the 1–9 keys` : `Pin ${c.finish_tag} to a 1–9 key`}
                      style={{ border: "none", background: "none", cursor: "pointer", padding: 2, color: pinned ? "var(--cobalt)" : "var(--ink-faint)", display: "inline-flex", flexShrink: 0 }}><Icon name="pin" size={12} /></button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(c.id); }} title={`Edit ${c.finish_tag} — colors, materials, Est. code`} aria-label={`Edit ${c.finish_tag}`}
                      style={{ border: "none", background: "none", cursor: "pointer", padding: 2, color: "var(--ink-muted)", fontSize: 12, flexShrink: 0 }}>✎</button>
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, padding: 8, borderTop: "1px solid var(--ink-faint)" }}>
        <button type="button" onClick={onFind} title="Add an item from the tool chest — the same search as Space" style={footBtn}>+ chest</button>
        <button type="button" onClick={onRaceway} title="Build a raceway run — type, size, conductors, mounting" style={footBtn}>+ raceway</button>
        <button type="button" onClick={onAdd} title="Add a blank item" style={footBtn}>+ blank</button>
      </div>
    </aside>
  );
}
