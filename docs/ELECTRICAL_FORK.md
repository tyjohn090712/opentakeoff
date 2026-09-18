# This fork: electrical-only

`tyjohn090712/opentakeoff`, forked from `Kentucky-ai/opentakeoff` `main` (2026-08-30). Upstream is a flooring takeoff engine; this fork commits to electrical only rather than staying generic/multi-trade. This doc is the plan — update it as waves land.

## The one thing that makes this tractable

The engine's "condition" object — `{ finish_tag, color, hatch, waste_pct, multiplier, materials[] }` — is not flooring-specific in structure, only in the *seed data* it ships with. `finish_tag` is threaded as a field name through the whole engine, especially `mcp/src/session.ts` (4,000+ lines — the core takeoff session logic). **Don't rename that field.** It's just a string key; `"REC-20"` or `"EMT-BRANCH"` is as valid a value as `"CPT-1"`. A global rename buys nothing (it's internal) and costs the ability to pull upstream engine fixes.

Materials have a `basis`: `"area"` (default), `"linear"`, `"count"`, or `"seam_lf"` — order qty = measured-in-that-basis ÷ `per`, rounded up. A condition's own `×N multiplier` scales every quantity on that condition, including every linear-basis material line, *before* the ÷ per happens (`totals.js` `conditionTotals`) — that's the mechanism Wave 1 uses for conductor count on a raceway run, not a new tool.

Second asset worth knowing up front: `web/src/lib/symbolsweep.ts` — the "mark one device, count every instance" tool — is pure geometric pattern matching over vector line segments, already trade-agnostic. Its own doc comments cite counting **receptacles** as a real benchmark case. Device counting already exists; what's missing is an electrical symbol library and a workflow around it (Wave 2).

## Wave 1 — seed data and vocabulary — DONE (`electrical/wave1-seed-conditions`)

- `web/src/lib/canvasConstants.js`: `FLOORING_DEFAULTS` → `ELECTRICAL_DEFAULTS`. 9 starter conditions: `REC-20`, `REC-GFCI`, `SW-1P`, `SW-3W`, `DATA-1`, `LT-2X4`, `LT-STRIP`, `PNL`, `EMT-BRANCH` — devices/panels as COUNT conditions, `LT-STRIP`/`EMT-BRANCH` as LINEAR conditions. `EMT-BRANCH`'s doc comment records the ×N-multiplier-as-conductor-count mechanism.
- `web/src/lib/canvasUtil.js`: `seedConditions()` updated to the renamed export.
- `web/src/lib/stamps.js`: the 3 starter shop-drawing stamps (plank direction / seam direction / pattern origin) → electrical equivalents (home run / feed direction / circuit numbering origin).
- `web/test/materials.test.ts`: the grout-deep-copy regression test no longer depends on the deleted CT-1 seed; it builds its fixture from `coverage.js`'s `GROUT_DEFAULTS` directly (the bug it guards isn't seed-specific, so this is a better test regardless of fork).
- **Correction to an earlier assumption**: `mcp/src/session.ts` does *not* carry a mirrored copy of the seed conditions — only a mirrored `PALETTE` (condition **colors**, trade-agnostic, needed no change). Grepping `finish_tag` there turns up illustrative example strings in tool descriptions (`"CPT-1"` used as a sample tag) — cosmetic, not a functional drift risk. Worth a documentation pass later (`mcp/src/tools.ts` tool descriptions), not a Wave 1 blocker.
- Verified: `npm test` (1668/1668 pass), `tsc --noEmit` clean, `eslint` 0 errors, `npm run build` clean. `npm run bench` (room-detection corpus) not run — untouched by this change.
- **Not done in Wave 1**: `README.md` / `docs/USER_GUIDE.md` prose still says "finish" and describes flooring materials (adhesive, grout, roll goods) — cosmetic, real for anyone else who ever opens this fork, tracked as follow-up rather than bundled into the seed-data commit.

## Wave 2 — device/fixture counting (mostly configuration, not new engine code)

- No new geometry: `symbol_sweep` already does marquee-one-instance → find-all-instances. The MCP server already exposed it to an external agent; the gap was the **in-canvas** BYO-AI agent (`web/src/lib/agentTools.js`/`agentLoop.js`), which could only propose areas. **Done**: a `sweep_symbol` tool wired to the same engine (`web/src/lib/symbolsweep.ts`), and `propose_shapes`'s `measure_role` extended with `count` (a single `[[x,y]]` point per device, no scale gate — a count is 1 EA regardless of calibration). Same accept/reject gate as area proposals; `AgentPanel` labels a staged count proposal `(count)`. System prompt and role-split copy updated to describe the workflow: marquee one instance → sweep → stage counts from matches/withheld → estimator accepts. Unit-tested in `web/test/agentTools.test.ts`.
- Still needed: a documented user-facing workflow write-up (mark one duplex receptacle → sweep → repeat per device type per sheet) in `docs/AGENT_GUIDE.md`/`docs/USER_GUIDE.md`, and — check whether swept symbols persist per-session or per-project before assuming — a saved symbol library keyed to the `ELECTRICAL_DEFAULTS` device types.
- `sweep_schedule_row` ties a swept count to a schedule row — the bridge to Wave 4 (a fixture/panel schedule instead of a finish schedule).

## Wave 3 — circuit / raceway takeoff (the real new work)

No flooring equivalent exists for "a run from panel to device, with wire count depending on conductor size and homerun length."

1. **Cheap first pass — done, both surfaces.** Raceway run as a LINEAR condition (`EMT-BRANCH`, already seeded in Wave 1) — trace by hand, set the condition's `×N multiplier` to the circuit's conductor count, and the report's LF and every linear-basis material line (conductor footage, coupling count) scale automatically. The in-canvas agent can now do the trace too: a new `measure_line` tool (`web/src/lib/agentTools.js`/`agentLoop.js`) takes a polyline the agent places along a run it's looked at (`view_region`) and returns LF at the sheet's scale — no engine change, same math `commitLinear` already runs. `propose_shapes` gained a third-then-fourth `measure_role`, `linear` (open polyline, ≥2 points, still scale-gated — a length is always real-world units, unlike `count`). Same accept/reject gate as area and count proposals. Unit-tested in `web/test/agentTools.test.ts`.
2. **Real pass (later)**: a new MCP tool (`trace_circuit`?) deriving routing + homerun length from committed device shapes + a panel location — closer in spirit to `derive_transitions` (derives a new quantity from shapes already traced) than anything else in the engine. Read `web/src/lib/transitions.ts` first — it's the closest precedent, including the withheld/refused pattern (`docs/AGENT_GUIDE.md` doctrine) for not shipping a wrong circuit guess as a confident number. `measure_line` (item 1) does NOT do this — it still needs a human (or the agent, having looked at the sheet) to say where the run actually goes; nothing infers routing yet.

Build (1) first, using it before deciding whether (2) is worth the geometry work.

## Wave 4 — panel schedule import

- Upstream's "Import from schedule" parses an architect's finish table into conditions behind a verify dialog; `sheetgraph.ts` (`sheet_graph`/`resolve_tag`/`find_schedule`) resolves schedule tables generically, not finish-schedule-specific by design.
- Retarget at panel schedules: circuit number, breaker size, phase, load description per panel. Reuses the citation-per-cell approach — the audit trail this fork wants (means and methods, part numbers, ambiguities as standalone lines), applied to panel schedules instead of finish schedules.

## Wave 5 — materials/waste model rework

- Wire = linear × conductor count (the multiplier mechanism, Wave 3.1). Boxes/devices = count basis. Conduit fittings = linear ÷ standard run length, rounded up — same shape as today's adhesive coverage math.
- Explicitly drop, don't fight upstream over: **roll goods** (`rollgoods.js` — broadloom/sheet-flooring seam layout) has no electrical analog. Leave the code, hide it from the condition UI so estimators never see a "roll setup" option on a conduit run. Same for the grout calculator and cove-base adhesive presets.

## Leave alone

- `oneclick.ts` (flood fill/room boundaries) — useful later for room-level device density or panel-to-room assignment.
- The provenance/audit model (scale, method, human-vs-agent, `mark_verdict`) and the MCP refusal/withholding doctrine — this was already exactly the auditable-AI-output instinct this fork wants; don't touch it.

## Workflow discipline (from upstream `AGENTS.md`, worth keeping solo)

- Branch per change, never commit on `main`.
- `cd web && npm run check` before calling anything done.
- Touching the MCP server specifically drifts 4 extra files independently (`AGENTS.md` names them) — check before assuming a tool change is complete.

## Suggested order

1. Wave 1 — done.
2. Wave 2 — device counting workflow, mostly using what exists.
3. Wave 3.1 — raceway-as-linear-condition, reuses existing math.
4. Wave 4 — panel schedule import, highest leverage for fast job understanding.
5. Wave 3.2 — real circuit-tracing tool, only once 1–4 are in daily use.
