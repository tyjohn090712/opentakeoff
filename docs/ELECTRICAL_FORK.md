# This fork: electrical-only

`tyjohn090712/opentakeoff`, forked from `Kentucky-ai/opentakeoff` `main` (2026-08-30). Upstream is a flooring takeoff engine; this fork commits to electrical only rather than staying generic/multi-trade. This doc is the plan — update it as waves land.

## The one thing that makes this tractable

The engine's "condition" object — `{ finish_tag, color, hatch, waste_pct, multiplier, materials[] }` — is not flooring-specific in structure, only in the *seed data* it ships with. `finish_tag` is threaded as a field name through the whole engine, especially `mcp/src/session.ts` (4,000+ lines — the core takeoff session logic). **Don't rename that field.** It's just a string key; `"REC-20"` or `"EMT-BRANCH"` is as valid a value as `"CPT-1"`. A global rename buys nothing (it's internal) and costs the ability to pull upstream engine fixes.

Materials have a `basis`: `"area"` (default), `"linear"`, `"count"`, or `"seam_lf"` — order qty = measured-in-that-basis ÷ `per`, rounded up. A condition's own `×N multiplier` scales every quantity on that condition, including every linear-basis material line, *before* the ÷ per happens (`totals.js` `conditionTotals`) — that's the mechanism Wave 1 uses for conductor count on a raceway run, not a new tool.

Second asset worth knowing up front: `web/src/lib/symbolsweep.ts` — the "mark one device, count every instance" tool — is pure geometric pattern matching over vector line segments, already trade-agnostic. Its own doc comments cite counting **receptacles** as a real benchmark case. Device counting already exists; what's missing is an electrical symbol library and a workflow around it (Wave 2).

## Wave 1 — seed data and vocabulary — DONE (`electrical/wave1-seed-conditions`)

- `web/src/lib/canvasConstants.js`: `FLOORING_DEFAULTS` → `ELECTRICAL_DEFAULTS`. Starter conditions: `REC-20`, `REC-GFCI`, `SW-1P`, `SW-3W`, `DATA-1`, `LT-2X4`, `LT-STRIP`, `PNL` — devices/panels as COUNT conditions, `LT-STRIP` as a LINEAR condition. (Wave 1 also seeded `EMT-BRANCH` on the ×N-as-conductor-count idea; that was wrong, and it was retired on 2026-11-12 — see the raceway builder below.)
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

1. **Cheap first pass — done, both surfaces.** Raceway run as a LINEAR condition — trace by hand. (Wave 1 said to set the condition's `×N multiplier` to the conductor count. **That was wrong:** ×N scales the raceway footage and the hardware too — a ×7 on 100 LF reported 700 LF of conduit and 70 couplings. Superseded by the raceway builder below, where the conductor count rides the wire line.) The in-canvas agent can now do the trace too: a new `measure_line` tool (`web/src/lib/agentTools.js`/`agentLoop.js`) takes a polyline the agent places along a run it's looked at (`view_region`) and returns LF at the sheet's scale — no engine change, same math `commitLinear` already runs. `propose_shapes` gained a third-then-fourth `measure_role`, `linear` (open polyline, ≥2 points, still scale-gated — a length is always real-world units, unlike `count`). Same accept/reject gate as area and count proposals. Unit-tested in `web/test/agentTools.test.ts`.
2. **Real pass (later)**: a new MCP tool (`trace_circuit`?) deriving routing + homerun length from committed device shapes + a panel location — closer in spirit to `derive_transitions` (derives a new quantity from shapes already traced) than anything else in the engine. Read `web/src/lib/transitions.ts` first — it's the closest precedent, including the withheld/refused pattern (`docs/AGENT_GUIDE.md` doctrine) for not shipping a wrong circuit guess as a confident number. `measure_line` (item 1) does NOT do this — it still needs a human (or the agent, having looked at the sheet) to say where the run actually goes; nothing infers routing yet.

Build (1) first, using it before deciding whether (2) is worth the geometry work.

## Wave 3.1b — raceway builder — DONE (`claude/stoic-galileo-er1wci`)

An estimator prices a run as one assembly — "3/4 EMT, 3 #10, on concrete" — not as conduit plus a multiplier, and doesn't want a second vocabulary to learn. **+ raceway** (top bar and Takeoffs panel) picks raceway type (EMT, RGS, IMC, PVC, FMC, LFMC) × trade size × conductors (count × wire size, optional separate ground, or 0 = empty) × mounting (concrete, steel, wood, t-rod, strut) and makes the linear condition `3/4 EMT 3-#10 CONC`. **MC cable** is the same dialog (cable size #14–#1 × 2–5 conductors → `12/2 MC WOOD`); its supports are conduit's five plus **drop wire**. Hundreds of combinations, so nothing is seeded; a project holds only what was picked, and the dialog reopens on the last pick.

- **The engine change** (`web/src/lib/totals.js`): a material line takes an optional `mult` (N of this line per basis unit; absent or ≤ 0 = 1) and an optional `waste_pct` (that line's own allowance, added before rounding; absent or ≤ 0 = none). They scale that line only; `basis_qty` carries both, so `qty = basis_qty ÷ per` still holds for every consumer. Editable in the material row (the number before the unit, and "% waste"); exported as the Coverage text (`3 lf / 1 LF +10% waste`, one shared `coverageText`); kept in plays. Not part of the material-library link (`libFields`) — line-local attributes. The condition's own `waste_pct` is a different thing: it feeds the Report's "w/ waste" columns and has never reached the buy list. Tests: `web/test/raceway.test.ts`, which fail without the totals change.
- **Waste, as the estimator specified:** all wire and all MC cable carry 10% on their own line (`WIRE_WASTE_PCT`); an MC condition's waste is 10% too (the cable is the run), a conduit condition's 5%. Conduit sticks get no line waste — the condition's 5% shows in "LF w/ waste" only. Say so if sticks should carry waste too.
- Conduit line: whole 10 ft sticks for EMT/RGS/IMC/PVC (the standard length — not an assumption), by the foot for flex. Wire: `THHN #N` at its count per LF. **No support quantities**: mounting only names the assembly; labor and supports are priced in the estimating system.
- `racewayName` (`web/src/lib/raceway.ts`) is the ONE place the item name is formatted — currently a placeholder (`3/4 EMT 3-#10 CONC`). **Match it to the estimating system's own item names** once a sample is in hand.
- Verified in the production build (Netlify-style CSP) on the sample plan: pick → add → trace 108.1 LF → Report reads 108.1 LF, 11 sticks, 476 LF of #10 (4 × 108.1 × 1.1, rounded up); a 12/3 MC on drop wire traced at 108.1 LF reads 119 LF of cable; drop wire is offered for MC only and a switch back to EMT falls back to concrete; a 7-conductor run with a separate ground survives a page reload; the same configuration picked twice selects the existing condition.
- **Not included:** an NEC Chapter 9 conduit-fill check. The area tables couldn't be verified against the code text itself (secondary sources only), and a fill check that's quietly wrong is worse than none. Add it when the tables can be checked. **MC cable bigger than #1** isn't in the builder (feeders run in conduit; use "+ condition").

## How this estimator works — decisions that shape what's built next (2026-11)

From the estimator (mostly tenant improvements), in their words, condensed:
- **TIs can't know what survives.** Without detailed demo plans or field investigation, treat every circuit as new branch wiring and conduit; existing breakers may stay. So there is no new/existing flag. The **plan's homerun circuit tags** (not the panel schedule) decide which circuits are in scope; schedule rows no plan tag references are flagged for a look, never taken off.
- **Wiring method.** MC in walls and overhead through non-OTS ceiling spaces; EMT (conduit) in OTS spaces and for **all homeruns**. Always spec-driven — the spec overrides. Pick the condition when tracing; no global switch.
- **A homerun (HR) is typically 3 circuits** to the same panel; 4 or 5 before derating becomes an issue (specs often dictate).
- **Panels and gear:** breakers come pre-installed in the vendor's lump-sum package. The deliverable is a **bullet list of panels and gear to take off, by floor and area**; breaker detail only for **loose breakers**, carried as a **budget** unless the plan or spec shows them — then only what's shown.
- **Items are Accubid-style assemblies** (raceway size × conductors × substrate), because a different vocabulary is another learning curve.

Next, in order: (1) match item names to the estimating system's (MC cable is in); (2) suggested raceway configuration per circuit (breaker size, poles → wire; 3 circuits per HR) and a homerun checklist from the imported schedules; (3) a per-panel "breakers: in vendor package / loose" setting, default package; (4) the panel and gear list by floor and area, from a header-only read; (5) matching plan circuit tags to schedule rows (text-layer plans only). The OTS zone split (auto-split a run into EMT inside OTS zones, MC outside) is optional now that homeruns are always conduit.

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
- **Scanned/flattened version of that template — done on a clean raster of the real sheet** (all five panels exact, nothing withheld, after two bugs it exposed: a dash-filled "CIRCUIT SIZE" column taken for POLES, and a breaker size re-read once per description line of a merged cell). Still to try: a *physically* scanned copy (skew, noise) of it. OCR confuses `O`/`0` in panel names — the name is editable in the dialog.
- **One marquee, many panels**: a sheet usually carries 4–6 panels; today it's one box per panel (the tool stays armed between them).
- **Highlight the source row** on the sheet from the dialog (the region and row y are already stored).
- **Feeder / homerun link**: panel ↔ raceway runs and fixture counts by circuit — the bridge to Wave 3.2. See "How this estimator works" below for what it has to respect.

## Wave 5 — materials/waste model rework

- Wire = linear × conductor count (a material line's own `mult`, see the raceway builder — not the condition's ×N). Boxes/devices = count basis. Conduit fittings = linear ÷ standard run length, rounded up — same shape as today's adhesive coverage math.
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
