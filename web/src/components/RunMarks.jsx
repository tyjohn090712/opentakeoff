// RunMarks — the points on an electrical run, drawn on the SVG overlay: a dot
// at each COUNTED point, a hollow ring at each uncounted bend (drafts only),
// and a "+10′" tag where adders were dropped. Coordinates are stage px in the
// caller's frame; `z` is the stage zoom, so sizes stay constant on screen.
// SVG presentation attributes take literal colors (AGENTS.md conventions).
import React from "react";
import { adderTag } from "../lib/runPoints.js";

const key = (p) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;

export default function RunMarks({ counted = [], uncounted = [], adders = [], color = "#1f3fc7", z = 1 }) {
  // adders at one spot read as one tag: "+10′" or "+20′ (2)"
  const byPt = new Map();
  for (const a of adders) {
    const k = key(a.at);
    const g = byPt.get(k) || { at: a.at, ft: 0, n: 0 };
    g.ft += a.ft; g.n += 1;
    byPt.set(k, g);
  }
  return (
    <g data-run-marks="" style={{ pointerEvents: "none" }}>
      {uncounted.map((p, i) => (
        <circle key={`u${i}`} cx={p[0]} cy={p[1]} r={4 / z} fill="#fff" stroke="#6b7280" strokeWidth={1.4 / z} />
      ))}
      {counted.map((p, i) => (
        <circle key={`c${i}`} cx={p[0]} cy={p[1]} r={4.5 / z} fill={color} stroke="#fff" strokeWidth={1.5 / z} />
      ))}
      {[...byPt.values()].map((g, i) => (
        <text key={`a${i}`} x={g.at[0] + 7 / z} y={g.at[1] - 7 / z} fontSize={11 / z} fontWeight={700} fill={color}
          stroke="#fff" strokeWidth={3 / z} paintOrder="stroke">
          {adderTag(g.ft)}{g.n > 1 ? ` (${g.n})` : ""}
        </text>
      ))}
    </g>
  );
}
