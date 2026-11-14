# Fork handbook — read this first, every session

This is `tyjohn090712/opentakeoff`, an **electrical-only fork** of `Kentucky-ai/opentakeoff` (a client-only React PDF takeoff app). Sessions start with no memory of earlier ones. This file is the memory: who the work is for, what's decided, how this environment works, and what has already gone wrong. The plan of record is [`ELECTRICAL_FORK.md`](ELECTRICAL_FORK.md); [`../AGENTS.md`](../AGENTS.md) is the upstream repo map. Where AGENTS.md disagrees about shipping, deploy, or CI, **this file wins for the fork**.

Keep it true. When a PR opens or merges, a decision changes, or you hit a new trap, update the right section in the same change.

## 1. Who this is for

The user is the **Chief Electrical Estimator at Prime Electric (Bellevue, WA)**. Their stack: Smartsheet (estimate schedule), Bluebeam, Accubid Classic 16, LiveCount cloud, and Drawer AI (new). They're moving to **ConEst** and don't have access yet. They work in Microsoft 365 and may use **only Copilot** at work, so assume no cloud AI key is available there: favor deterministic, on-device features (the panel-schedule OCR runs in the browser for this reason). Drawings are **confidential bid documents**.

They write tersely, in trade shorthand. Don't ask them to restate context that's in this file.

| Term | Means |
|---|---|
| TI | tenant improvement, the bulk of their jobs |
| HR | homerun: panel to first device; typically 3 circuits in one conduit |
| OTS | open-to-structure ceiling (exposed) |
| MC / EMT / RGS / IMC / FMC / LFMC | armored cable / thin conduit / rigid / intermediate / flex / liquidtight flex |
| SW (as in "20A SW duplex") | switched receptacle (read as half-hot duplex; unconfirmed) |
| FA, SS | fire alarm; speaker/strobe |
| OCP, MLO, MCB | overcurrent protection (breaker size), main lugs only, main circuit breaker |
| Est. code | an item or assembly code in the estimating system |
| t-rod, strut, drop wire | support types: threaded rod, strut channel, ceiling drop wire (MC only) |

## 2. Decisions already made (don't re-ask)

From the estimator, condensed; the longer version is "How this estimator works" in ELECTRICAL_FORK.md.

- **Every circuit on a TI is new** branch wiring and conduit. They can't know what survives. Existing breakers may stay. So there is no new/existing flag. The **plan's homerun tags** decide which circuits are in scope, not the panel schedule.
- **Wiring method:** MC in walls and overhead through non-OTS ceilings; EMT in OTS spaces and for **all homeruns**; always spec-driven (spec overrides). Pick the condition when tracing. No global switch.
- **Panels and gear:** breakers come pre-installed in the vendor's lump-sum package. The deliverable is a **bullet list of panels and gear to take off, by floor and area**. Carry loose breakers as a **budget**, or only what the drawings or spec show.
- **Items are priced as assemblies,** Accubid-style: size × conductors × mounting. Mounting names the assembly only; supports and labor are priced in the estimating system, so don't invent support quantities.
- **Waste:** all wire and all MC cable carry **10%** (on the material line and, for MC, the condition); conduit conditions 5%; conduit lengths get no line waste (offered, not yet answered).
- **Names need not match Accubid exactly** (they want to match ConEst, unseen). `racewayName` in `web/src/lib/raceway.ts` is the one place the format lives.
- **Tool chest, not an item/assembly database.** The estimating system owns labor, prices and assemblies. The seam is the **Est. code** column; when ConEst's item list can be exported, import it as a read-only pick list.
- **LiveCount is the model for picking and tracing** (2026-11-14). Pick the item and its tool comes with it. On a run: every click is a counted point, `⇧`-click uncounted, `G` a disconnected point, a `Space` tap an adder of the item's length; with no run in progress `Space` opens the item search. Layout plan agreed: (1) this, (2) an always-open item list on the left with editing in a drawer, (3) one top row, a status bar with snap toggles, a labeled right drawer, flooring tools hidden (not deleted).
- **Device depth matters:** `20A duplex`, `20A switched duplex`, `wall-mount speaker/strobe` and so on, each its own item. The starter catalog is mine, from common practice; the estimator will correct it.

## 3. What exists (and where)

Waves 1–4, the raceway builder, the tool chest, and step 1 of the LiveCount-style picking work are built. Details, lessons, and open items are in ELECTRICAL_FORK.md.

| Capability | Code |
|---|---|
| Seed conditions, device counting, linear runs in the in-canvas agent | `web/src/lib/canvasConstants.js` (`ELECTRICAL_DEFAULTS`), `agentTools.js`, `symbolsweep.ts` |
| Panel-schedule import (text layer + on-device OCR) | `panelSchedule.ts` (parser), `panelRaster.ts`, `panelOcr.ts`, `ocrEngine.js`, `panelSchedules.js`, `components/ImportPanelPanel.jsx` |
| Raceway builder (conduit and MC cable) | `raceway.ts`, `components/RacewayBuilder.jsx` |
| Tool chest and starter devices | `chest.js`, `deviceCatalog.js`, Takeoffs panel › Chest tab (`components/TakeoffsPanel.jsx`) |
| Material line `mult` and `waste_pct` | `totals.js` (`conditionTotals`, `coverageText`) |
| Item search (`Space`), item arms its tool, run points / adders / `G` jumps | `components/QuickPick.jsx`, `chest.js` (`quickPickResults`, `conditionMeasure`), `runPoints.js`, `components/RunMarks.jsx` |
| Tests (synthetic data only) | `web/test/{panelSchedule,panelRaster,panelSchedules,raceway,chest}.test.ts` |

**Not built yet** (see "Next, in order" in ELECTRICAL_FORK.md): layout steps 2 and 3 (section 2), ConEst-name matching, suggested raceway config per circuit and a homerun checklist, the per-panel "breakers: in vendor package / loose" setting, the panel and gear list by floor and area, circuit-tag matching, chest CSV import/export, the Est. code pick-list import. **Deliberately not built:** an NEC conduit-fill check (the Chapter 9 tables couldn't be verified against the code text; a quietly wrong check is worse than none).

## 4. Traps in the code (each one cost real time)

- **A condition's ×N scales everything on it, raceway footage included** (×7 on 100 LF reads 700 LF of conduit). Never use it as a conductor count. The count is a material line's own `mult`.
- **A run's points and adders live on the shape (`run`), not in `computed`.** Totals add them through `runPoints.js` helpers; anything new that sums a linear shape's LF or EA must use `runTotalLf` / `runCountedPoints`, or it silently misses adders and points.
- **`Space` is tap vs hold.** Hold-and-drag pans; a quick tap runs `spaceTapFnRef` (adder mid-run, else the search). Key handlers re-subscribe on `poly`, not on point meta: read `polyMetaRef` / `gapNextRef` in them, never the state (a stale copy lost two adders once).
- **Two different "waste"s.** The condition's `waste_pct` feeds the Report's "w/ waste" columns and never the buy list. A material line's `waste_pct` is added before rounding and is the one that reaches the buy list. `mult` and line `waste_pct` are line-local: they are not part of the material-library link (`libFields`).
- **New projects seed from starred chest items** (`seed !== false`, so a library saved before the chest still seeds); none starred means the built-in defaults. Chest-only items (`seed: false`) never flood a project.
- **Don't rename `finish_tag`;** it's the field name through the whole engine. Don't re-theme condition palettes (user data).
- **Waste applies only in the report,** never to live measured numbers.
- **"Withheld, never guessed."** Anything the importers can't read becomes a `withheld` row with a reason and stays out of counts. Keep that doctrine.
- **Vite doesn't flag undefined identifiers in JSX.** Grep your new identifiers and load the app once.
- **`TakeoffsPanel` is `React.memo` with a stable handler registry.** A new panel handler goes in `panelHandlersRef.current` (TakeoffCanvas) *and* the panel's props. Cursor-following UI uses direct DOM writes, never state per mousemove.
- **Scale must be set before measuring.** Counts don't need it; lengths do.
- **Persistence is the browser's IndexedDB:** database `opentakeoff`, store `meta`, key `annotations` is the one project; `condition_templates` is the chest. One project per browser, no sharing between estimators (an open question). Deleting `annotations` and reloading is how to get a fresh project.
- **OCR on ruled tables needs help** (erase the rules, read per-column strips, a single-line second look on gray, circuit numbers as a grid). Whole-region Tesseract is mostly garbage. Each new panel-schedule template can fail at the header: test real sheets from different engineers.
- **`mcp/` dependencies aren't installed** in this checkout. For an MCP edit, syntax-check with esbuild and follow AGENTS.md's doc-sync list. The Wave 1 `mcp/src/session.ts` mirrors only `PALETTE`.

## 5. Working here

**Environment.**
- Default Node is 22; the repo needs **24** (`web/.nvmrc`). In a fresh container: `export PATH="$(dirname "$(npx -y -p node@24 -c 'which node')"):$PATH"`, then `cd web && npm ci`. Use `npm ci` (not `rm -rf node_modules`, which the sandbox blocks) and don't `pkill -f` a pattern that matches your own shell (use `pkill -f "[p]attern"`).
- **`npm run check`** = typecheck + lint + tests + bench + build, exactly what CI runs. One lint warning (`TakeoffCanvas.jsx`, unused `eslint-disable`) is on `main` too. Single test file: `node --import tsx --test test/<file>.test.ts`. A new test should be shown failing without its fix.
- **Session context.** The root `CLAUDE.md` imports `AGENTS.md` and this file, so both load into every Claude Code session at launch (cloud sessions clone `main`, so it reaches them once merged). Don't add a `CLAUDE.local.md`: it makes Claude stop reading `AGENTS.md` on its own. Imports count in full toward context; keep this file under about 200 lines. In a new session, `/context` or `/memory` should list both files.
- Scratch work (harnesses, test PDFs, screenshots) goes in the scratchpad, **never in the repo**, and the scratchpad can be cleared, so anything worth keeping belongs in the repo.

**Browser verification.** Playwright and Chromium are preinstalled: `require("playwright")` works anywhere and `chromium.launch()` needs no options. Verify against the production build, served the way Netlify serves it (the repo's `web/public/_headers` CSP matters for OCR: `worker-src 'self'`, `'wasm-unsafe-eval'`):

```js
// serve.mjs — node serve.mjs web/dist  (port 5180)
import http from "node:http"; import { readFileSync, existsSync, statSync } from "node:fs"; import { join, extname } from "node:path";
const root = process.argv[2], hdrs = {}; let cur = null;
for (const l of readFileSync(join(root, "_headers"), "utf8").split("\n")) {
  if (!l.trim() || l.trim().startsWith("#")) continue;
  if (!/^\s/.test(l)) { cur = l.trim(); continue; }
  const m = l.match(/^\s+([A-Za-z-]+):\s*(.*)$/); if (m && cur === "/*") hdrs[m[1]] = m[2];
}
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".json": "application/json", ".gz": "application/octet-stream" };
http.createServer((q, r) => { let f = join(root, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!existsSync(f) || statSync(f).isDirectory()) f = join(root, "index.html"); r.writeHead(200, { ...hdrs, "Content-Type": types[extname(f)] || "application/octet-stream" }); r.end(readFileSync(f)); }).listen(5180);
```

Selectors that took effort to find:
- Start screen: **"Load sample plan"** (a flooring plan with no panel schedule). Wait about 5 s, then **"Set scale…" → "Plan says 1/8" = 1'-0" — use it"**.
- Takeoffs panel starts collapsed; toggle by title **"Takeoffs — conditions + running totals"**. Tabs: Takeoffs · **Chest (n)** · Materials · Columns. Top-bar chips: **"+ condition"**, **"+ raceway"**. **REPORT** opens the report.
- Keys: `L` linear (finish with `Enter`), `C` count, `A` area. **⋯ › Import panel schedule** arms the schedule box.
- The app uses `window.prompt` and `window.confirm` in several flows (chest save, new column value); register a dialog handler or the script hangs.
- Real drawings for testing live only in the scratchpad (the Drive folder below). Tests use made-up names; scan a diff for project names before committing.

**Git and GitHub.**
- Develop on the branch the session names (it has been `claude/stoic-galileo-er1wci`, and `ccr-e8c0892e-w7l1b4`). There is **no `gh`** and the REST route is limited: load the GitHub tools with ToolSearch (`mcp__github__*`). The repo is **`tyjohn090712/opentakeoff`** (not `tyjohnson…`).
- **Never force-push** (the classifier denies it). After a squash-merge the branch diverges from `main`. Restart it without force: `git fetch origin main claude/<branch> && git checkout -B claude/<branch> origin/main && git merge -s ours origin/claude/<branch>`, then commit and push normally.
- Commits end with the `Co-Authored-By` and `Claude-Session` trailers the session gives. PR bodies follow `.github/PULL_REQUEST_TEMPLATE.md` and end with its attribution line. Squash-merge.
- **Actions are off on the fork:** no checks run on PRs. Run `npm run check` yourself and say so in the PR.
- **Netlify** (site `lively-cendol-76f155`) comments a deploy preview on each PR (`deploy-preview-<n>--lively-cendol-76f155.netlify.app`), so the estimator can test before merge. Merging to `main` is expected to deploy production; I haven't seen the dashboard, so if it matters, ask them to confirm it shows Published. A hosted preview is the right way to let them test; a zip is the old fallback.
- **When to open and merge.** Open a PR only when asked. Merge only on their word. They have said "merge it", "you can merge", and "PR is good to go" (treated as merge approval). If it's ambiguous, say plainly what you did.

**Google Drive.** `My Drive › ESTIMATING DEVELOPEMENT` (sic) holds drawing sets the user said to use freely, including the EAT06 panel schedules. The connector can't download files over about 10 MB; ask them to extract the pages. Deliver files to them with the file-send tool, from the working directory or scratchpad.

## 6. How to work with them

- **Lead with a recommendation.** Brainstorming means reassessing and deciding, not a menu. Ask only what blocks: a question that changes what you build next.
- **Say what you're doing** during long work, in a few words, then continue.
- **Report faithfully:** measured vs expected numbers, what was *not* tested, what you couldn't verify. They've corrected claims before; when they correct you, record it here.
- They may follow from a phone. Final messages are self-contained, scannable, no jargon you didn't define.
- Don't answer an estimator's question with agent-manual text, or the reverse (the doc set is split by audience; see AGENTS.md).

## 7. Mistakes not to repeat

- Told them to set a condition's ×N to the conductor count; it inflated conduit footage (fixed in the raceway builder, PR #6).
- Claimed a full-size 300 dpi scan wouldn't render, from a mismatched wait string ("Rendering sheet..." vs "…"); it took 28 s.
- Assumed a missing text layer sank the EAT06 import; the cause was a different template (`OCP SIZE`, no POLES column).
- Guessed GitHub owner `tyjohnson090712`; it's `tyjohn090712`.
- Assumed existing circuits could be separated from new ones on a TI; they can't.
- Defaulted to a database when a labeled tool chest was the right size.

## 8. State (update when it changes)

| | |
|---|---|
| Merged to `main` | #3 Waves 2 and 3.1 · #4 panel schedule import · #5 `OCP SIZE` / no-POLES templates and two OCR fixes · #6 raceway builder (conduit and MC cable, line `mult` and `waste_pct`) · #7 tool chest, starter devices, Est. code column, this handbook |
| On a branch, not yet a PR | Step 1 of the LiveCount-style work: `Space` item search, items arm their tool, counted / uncounted points, `G` jumps, adders (branch `ccr-e8c0892e-w7l1b4`) |
| Tests | 1763 (3 skipped), all passing under `npm run check` |
| Waiting on the estimator | Whether counted points should feed a separate count item and whether `Space` while counting should do anything but search; ConEst access and item names; confirmation that "SW duplex" means switched; their own device list (candela variants, fixture types); whether conduit lengths should carry waste; whether projects must be shared between estimators |

## 9. Session start checklist

1. Read this file, then "Next, in order" in ELECTRICAL_FORK.md.
2. `git fetch origin && git status && git log --oneline -5`; check which PRs are open before building.
3. Get Node 24 and `npm ci` (section 5).
4. Build on the session's branch; for any behavior change update README, `USER_GUIDE.md`, `CHANGELOG.md`, and ELECTRICAL_FORK.md together.
5. `npm run check` before pushing; verify the changed flow in the production build.
6. Update sections 2, 7 and 8 here before you finish.
