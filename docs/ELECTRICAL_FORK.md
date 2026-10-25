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

## Wave 4 — panel schedule import — DONE (`claude/stoic-galileo-er1wci`)

**⋯ › Import panel schedule**: marquee one panelboard's schedule → a review dialog → the panel is saved with the project (`panel_schedules` payload key), shows in the Report (**Panel schedules — breakers**, with an all-panels roll-up), and exports as **Panel breakers CSV** (one row per panel per breaker size + spaces + every unresolved row — the shape that goes into Accubid). Optional `PNL-<name>` count condition for placing the panel on the plan.

What the real sheets taught (14 panels from three real bid sets in the owner's files — kept out of this public repo, they're confidential):
- **Most panel schedules in the wild have no text layer.** All three sheets pulled were either a 300 dpi scan or Bluebeam-flattened vector (text drawn as paths). A text-layer-only importer would have read none of them. So there are two readers behind one parser:
  - vector text → `extractRegionText` tokens, columns from the vector rules (`panelRaster.rulesFromSegments`);
  - no text → **on-device OCR** (tesseract.js, shipped with the app, ~7 MB lazy-loaded, nothing uploaded — matters for NDA drawings and for an estimator who can't use a cloud AI at work).
- **OCR needs help on ruled tables.** Whole-region Tesseract on a panel schedule is mostly garbage. What made it exact: erase the table rules first (`cleanForOcr`), read one column strip at a time (sparse OCR drops the lone `1`s), a single-line second look at any implausible cell, and a gray (not binarized) raster for that second look (binarizing jags narrow-font `3`s into "0A").
- **Circuit numbers are a grid.** OCR drops repeated digits ("11"→"1", "34"→"4"); the parser fits the row pitch and the majority base per side and corrects against it, and fills rows whose lone "1" never read (a merged 3-pole cell needs rows 1 and 5 to exist to land on 1-3-5).
- **Two templates seen**: Revit default (`--` continuation rows) and a merged-cell template (text centered on the middle row of a 3-pole, between rows of a 2-pole, wrapped descriptions spanning rows). Both resolve to the same spans.
- **Withheld doctrine carried over**: no readable trip, a non-standard trip (NEC 240.6(A)), or unreadable poles → `withheld` with a reason, out of the counts until the estimator types the value in the dialog.

Result on the 14 real panels (scratch harness, not in the repo): every breaker count matched the drawing; 0 rows withheld after the gray second look. Browser end-to-end verified on a vector synthetic sheet (64 ms) and a scanned panel (8.6 s including the reader's first load).

Code: `web/src/lib/panelSchedule.ts` (parser, pure), `panelRaster.ts` (rules, OCR clean-up), `panelOcr.ts` (two-pass OCR orchestration, engine injected), `ocrEngine.js` (tesseract.js in the browser), `panelSchedules.js` (persistence, roll-up, CSV), `components/ImportPanelPanel.jsx` (review dialog). Tests: `test/panelSchedule.test.ts`, `test/panelRaster.test.ts`, `test/panelSchedules.test.ts` (synthetic data only).

Not done / next:
- **A third template, found by testing a real Revit text-layer sheet (five panels):** breaker size headed `OCP SIZE`, circuit `NO.`, name under `DESIGNATION:`, a `CIRCUIT SIZE` wire column that must not be mistaken for the breaker, and **no POLES column** — pole count is the merged cell's height, measured from the row borders (`hRulesFromSegments` for vector sheets, the pixel rule finder for scans). The first release read none of these panels ("no circuit table header found"); all five now read exactly. Lesson kept: each new template can fail at the header, so keep testing real sheets from different engineers and offices.
- **Still to try:** a scanned or flattened sheet of the no-POLES template (the pole-count measurement uses the pixel rule finder there, untested on a real one).
- **One marquee, many panels**: a sheet usually carries 4–6 panels; today it's one box per panel (the tool stays armed between them).
- **Highlight the source row** on the sheet from the dialog (the region and row y are already stored).
- **Feeder / homerun link**: panel ↔ `EMT-BRANCH` runs and fixture counts by circuit — the bridge to Wave 3.2.

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
4. Wave 4 — panel schedule import — done (text layer + on-device OCR).
5. Wave 3.2 — real circuit-tracing tool, only once 1–4 are in daily use.
