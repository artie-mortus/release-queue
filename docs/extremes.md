# How far to push Release Queue

Investigated October 26, 2026. Scope: ambitious product/design directions and aggressive performance/simplification. This is a proposal supported by local experiments. At the time of the investigation, application behavior had not been changed.

My recommendation is to build a launch planning workbench. Let someone compare additions, pace, and playback policies against the question they came to answer: will this keep me occupied until launch? The largest useful experiment is a scheduler that can fill the gaps between TV episodes with other queued items. The most valuable simplification is one forecast model and one state transition path shared by every view and experiment.

The current static architecture can support this. A backend, account, required build step, or cloud AI service does not solve the measured problems.

## Step 1 implementation follow-up

Implemented October 27, 2026:

- Plan forecast rows are retained while the queue, schedule, target, and calendar day are unchanged. The shared computation signature invalidates them when any of those inputs change.
- Search-result append previews use the core `previewAppend` summary instead of re-running the dated-episode scheduler for every immediately available candidate. The optimization preserves existing waiting time and only adds capacity after the baseline finish.
- Portable backup export and import share a 10 MiB ceiling. Larger exports are refused rather than truncated, and imports over the same byte limit are rejected before parsing. This file limit does not prevent the app from parsing larger locally stored state.

Verification: `tests/time-bridge-core.test.js` checks append-summary equivalence across schedule, date, queue, and duration combinations; `tests/extremes-benchmark.cjs` checks 2,520 cases against full forecasts. `tests/portable-save.test.cjs` exports a 1.6 MB save in Chromium and imports the generated text on both HTTP and direct-file URLs, then verifies rejection above the limit in both directions. The updated `test-results/extremes-benchmark.json` records the actual cache and append paths. In this local run, a 5,000-movie unchanged Plan render measured about 0.5 ms versus about 210 ms when rows were forced to rebuild; dated forecast computation itself remains necessary and can dominate that render.

The larger Undo-history behavior remains for the next state/identity step. The workbench, interleaving policy, and named alternatives are still proposals.

## What the current app already does

The app already has candidate coverage previews, temporary pace/date scenarios, runtime variations, selectable game targets, Completed, Undo, duplicate warnings, portable saves, and TV airdate handling. Those are foundations, not new proposals. Earlier recommendations in `product-opportunities.md` and `improvement-review-2026-10-26.md` partly describe work that is now implemented.

The current design record also matters. Desktop comes first; the owner selected graphite, plum/violet, peach YouTube controls, local Inter, and the current icon families. Roads/maps, lava shapes, bright neon tubes, and teal budget panels were rejected. The proposals below spend their design risk on interaction and hierarchy. They do not revive those treatments or change the saved style decisions.

## Three increasingly ambitious product directions

### 1. Turn the forecast into a workbench

Put a compact coverage chart, the next action, and a proposed change in the same working area. The countdown becomes context beside the release marker. The queue remains the main editable object.

Illustrative example, using September 22 to November 19, 2026, not the reader's current plan: 58 days, 21 available hours/week, 7 recurring YouTube hours/week, and a 70-hour queue. Capacity is 116 queue hours, so 46 hours remain uncovered.

```text
Release Queue                             GTA VI, Nov 19     Add item

Your queue covers 70 of 116 available hours
Today   [ your queued items              ][ 46 h gap ]   Release

Try a change                         Saved plan      Proposed
Weekly budget: 21 h -> 15 h           46 h short       Covered
Queue hours left for launch           0 h             About 4 h
                                          Use this pace   Discard

Up next: Red Dead Redemption 2                 +1 hour played
Your queue                         Find     Filter     Edit item
1  Red Dead Redemption 2                         50 h remaining
2  Other selected media                         20 h remaining
```

The 15-hour budget leaves about 66.3 hours of queue capacity after YouTube, so about 3.7 hours of the 70-hour queue remain. This is an assumption someone may choose, not advice to change their leisure time. Under the illustrative delayed-release scenario of another 14 days, the original 21-hour budget instead needs 74 additional hours.

Add the inverse question: "Which weekly budgets would make this queue last?" Evaluate the allowed whole-hour budgets against the actual schedule instead of relying on a flat division. Exclude budgets with no queue time. Explain when unknown estimates, future episodes, or a job transition change the answer. The engine should be allowed to say that no offered budget fills an availability gap.

Compare a proposed group of additions before adding any of them. Accept one proposal with one Undo action. Start with user-selected candidates and known or editable runtimes; discovering an unlimited catalog is a separate problem.

The visible simplification is substantial: put row editing behind selecting an item, keep the primary progress action beside Up next, and use the larger area for the queue and comparison. Keep quick weekly-budget and YouTube controls because those were explicitly requested. Plan, Completed, and Settings can retain their existing navigation initially. A later experiment could place Queue and Compare in the main area and move Completed/Settings to utilities, but that is a navigation proposal rather than a prerequisite.

**Why choose this first:** it makes the existing calculations easier to act on without inventing a second definition of success.

### 2. Fill waiting gaps automatically

The current forecast preserves strict playback order. If the next TV episode is unavailable, every later item waits too. Moving a whole show later is a blunt workaround when some of its episodes are already available.

Offer an explicit preview policy, **Fill waiting gaps**, alongside the current strict order. When an episode is unavailable, consume available content farther down the queue. Return to the higher-priority show when its next episode becomes available. Preserve episode order within each title and personal progress. This policy assumes flexible items can be paused and resumed; disclose that assumption before applying it.

Consider a 14-day wait at one queue hour/day:

| Content | Availability | Remaining time |
| --- | --- | ---: |
| Show episode 1 | Today | 1 hour |
| Show episode 2 | Day 10 | 1 hour |
| Game | Today | 12 hours |

Strict order consumes episode 1 on day 0–1, waits until day 10, consumes episode 2 on day 10–11, then reaches three game hours before day 14. Nine available hours are uncovered. The proposed policy uses nine game hours during the wait, watches episode 2, then resumes the game's last three hours. All 14 hours are occupied.

This is a material product change. The implementation must walk availability events and item progress, returning multiple play intervals per item. The existing `queuePositionAtHours` assumes a consumed prefix of the queue, so it cannot identify progress correctly after interleaving. A single "item at launch" also needs to distinguish the current interval from remaining progress across titles.

Build the preview and compare its intervals before changing the active schedule. Keep strict order as the default. Let users protect items from interruption or movement. When every remaining item is unavailable, show the gap honestly. Adding content to the end of the strict queue cannot repair an earlier wait.

**Why this is the largest useful bet:** it changes Release Queue from reporting an avoidable gap to constructing a plan that fills it, using the library and runtime data already present.

### 3. Explore a family of plans

Replace the single faster/slower preview with a small matrix of plausible budgets and release dates. A cell says "covered", "12 hours short", or "waiting for episodes". Selecting it opens the actual queue intervals and assumptions. Compare shorter/current/longer estimated runtimes without calling the results probabilities.

Save named local alternatives such as "Current plan", "Busy November", and "Release delayed". Store changes to assumptions and queue selection against shared media data; avoid cloning every episode list into every plan. A provider refresh should visibly identify which alternatives it changes. Historical comparisons need either a frozen source revision or a clear "recalculated with current metadata" label.

Add dated budget changes so a vacation or busy week can be represented directly. Both existing job adjustments and those exceptions should compile to the same piecewise capacity schedule. Do not create separate arithmetic for each new control.

The extreme version can suggest a small set of changes: add these selected titles, move this available item before the show, or choose this budget. Rank proposals by user preferences and the resulting uncovered time. Evaluate each proposed order through the real forecast. Total runtime alone cannot judge a plan with future airdates, and a greedy combination is not automatically an optimal recommendation.

A 7-by-7 matrix already requires 49 forecasts before runtime variants. Today's dated-episode path costs roughly 9 ms per ordinary render in the large fixture. This interaction needs compiled source data and reusable summaries before a larger grid will feel immediate. Render a few selected results first; schedule further local computation in batches if needed.

**Why defer this:** it multiplies the value of a good planner, but also multiplies the cost and confusion of a bad one.

## Visual direction for the workbench

Use the existing tokens: graphite `#101113`, surface `#1b1c1f`, violet `#282432`, pink `#f5a4ce`, lavender `#c4b5fd`, and peach `#ffbd9b`. Keep Inter for display, text, and tabular figures. Retain the selected icon assets. This is a compact proposed token set, not an update to `.tastemaker/style-lock.md`.

Left-align the queue and comparison labels. Use one calendar chart as the distinctive element. On desktop, place proposed changes beside their effect; stack them on phones. Draw known waiting gaps separately from the final shortfall. A launch-focused chart should show today through release, with a separate indication of content remaining afterward. A huge post-launch backlog should not squeeze the actual wait into an unreadable sliver, as stretching the current axis to the full queue can do.

Use text alongside color for shortages and provisional estimates. Animate a changed chart endpoint or accepted move, and honor reduced motion. A dashboard of large summary cards would repeat the existing forecast in several forms. Keep the calendar, comparison, and next action as the main hierarchy.

This is a design proposal based on the current markup and recorded preferences. I did not perform a fresh visual layout audit or build this interface during the investigation.

## What actually limits performance

The current runtime is 325,800 bytes across `index.html` and `time-bridge-core.js`, 5,429 lines. The HTML contains about 66.7 KB of inline CSS and 172.0 KB of inline JavaScript. File size alone is not the interesting result. Unchanged ordinary queue renders already avoid rebuilding rows and are cheap.

I added [`tests/extremes-benchmark.cjs`](../tests/extremes-benchmark.cjs) and recorded its results in [`test-results/extremes-benchmark.json`](../test-results/extremes-benchmark.json). The fixtures deliberately exceed normal personal queues. Movies have 2–8 remaining hours. Shows have 1,000 half-hour episodes each; the dated fixture makes ten episodes available per calendar day, starting on the fixed clock's date. Progress starts at zero. Schedule inputs are simple mode, 21 hours/week, one hour/day of recurring YouTube, and no delayed start.

### Large lists are a rendering problem

Representative local medians, rounded; final recorded measurements should be treated as diagnostics rather than speed guarantees:

| Operation | 100 movies | 1,000 movies | 5,000 movies |
| --- | ---: | ---: | ---: |
| Forced render, synchronous DOM work | About 7 ms | About 50 ms | About 225 ms |
| Forced render plus explicit layout | About 30 ms | About 290 ms | About 1,400 ms |
| Unchanged queue view | Under 1 ms | Under 1 ms | Under 1 ms |
| Unchanged Plan view | About 6 ms | About 51 ms | About 235 ms |
| Ten search results | About 1 ms | About 9 ms | About 43 ms |

The 5,000-item queue produces about 115,700 document elements in this fixture. Replacing list markup is only part of the cost. The explicit layout measurement makes that visible. It still excludes paint and is not an INP measurement.

`renderWorkspace`, near `index.html:4278`, reconstructs the entire projected-finish list whenever the Plan view renders. The 30-second render timer therefore repeats work even when that list is unchanged. In the isolated experiment, retaining those rows lowered the 5,000-item unchanged Plan render to about 0.5 ms. The experiment preserves the old list markup while skipping its construction; a shipped cache must invalidate for queue revision, schedule, target, and calendar-day changes.

Rendering the first 100 queue rows with a precomputed full-queue forecast took about 24–29 ms including layout in the larger movie fixtures, compared with about 1.4 seconds for all 5,000 rows. This is a work-volume experiment, not a functioning paginator. Counts, filters, keyboard focus, hidden-item actions, and reorder semantics still need a real implementation.

**Recommendation:** cache unchanged Plan rows first. Then use stable item IDs and update changed row content. Introduce explicit pagination or Load more for unusually large queues before committing to a virtual scroller. Apply the same bounded rendering to projected finishes and Completed. Keep the forecast over the full queue, and support "View existing item" even when its row is on another page.

`syncQueueDerivedState` currently visits every row after a preserved estimate edit. At 5,000 items that path is still roughly 267–289 ms despite avoiding full row replacement. Stable IDs should let the changed row update locally; only date labels affected by that change need subsequent updates. Incremental DOM updates without reducing visible row count will not eliminate initial layout cost.

### Dated episodes reopen the forecast bottleneck

| Operation, 25 shows with 1,000 episodes each | Undated episodes | Dated episodes |
| --- | ---: | ---: |
| Unchanged queue render | About 0.5 ms | About 9 ms |
| Render ten search results, before paint | About 0.3 ms | About 94 ms |
| Evaluate ten full append forecasts, without result markup | About 1.3 ms | About 81–83 ms |
| Current scenario panel calculation/render | Under 1 ms | About 35–37 ms |

`forecastAvailableQueue`, near `time-bridge-core.js:403`, slices and scans episode arrays, creates chunks, parses availability dates, and constructs playback/wait intervals on every invocation. The totals-only path deliberately falls back to that full forecast when any airdate exists. In each render of ten search results, instrumentation counted eleven `forecastItems` calls: one baseline and ten appended candidates. Five measured renders therefore produce 55 calls.

The implemented optimization is precise: for a positive-duration, immediately available item appended to the end, the existing waits stay fixed. Compute its finish and consumption from the baseline endpoint and unused capacity after that endpoint. Do not recalculate the prefix. `TimeBridgeCore.previewAppend` agrees with 2,520 full forecasts covering different paces, starts, job transitions, stalls, zero-hour entries, airdates, and release horizons. Its batched arithmetic remains below 1 ms per ten summaries locally; that excludes the one required baseline forecast, result matching, and DOM work. This is an append-specific summary, not a new general-purpose scheduler.

Next, normalize episode dates and cumulative durations once per source/progress revision. Reuse those inputs across budget and target comparisons. Give callers the detail they need: coverage totals, per-item finish dates, or full playback intervals. Every level must use the same scheduling policy. Do not introduce a fast forecast that silently ignores airdates.

**Recommendation:** fix the append path before building multi-candidate previews; compile dated source data before building an interactive scenario matrix. Workers or a different language would be premature while repeated parsing and unnecessary allocation remain.

### Saves impose a lower ceiling than the forecast

The 25-show fixtures serialize to approximately 1.71 MB without dates and 2.69 MB with dates. Both parse successfully through the core. Both save successfully in the isolated local Chromium contexts. Both exported texts are rejected by the actual file input handler: "The selected file is too large."

That handler rejects files over 1,000,000 bytes at `index.html:2690`, while export has no matching limit. This is a concrete round-trip failure. The benchmark passes each generated file through the real handler and records the rejection. Browser storage availability elsewhere is not guaranteed by this local result.

Both fixtures also retain zero Undo entries. `checkpoint` stores an entire serialized state, and `trimUndoStack` removes a snapshot exceeding the 500,000-character history budget. This retains the established bounded-storage behavior, but a large source list makes even a tiny edit lose its inverse operation.

Replacing Markdown with JSON is not a universal size win. JSON encoding of the parsed snapshot is about 234 KB versus 195 KB of Markdown for 5,000 simple movies. For dated shows, JSON is about 1.69 MB versus 2.69 MB because the Markdown cell percent-encodes JSON punctuation. Either format can still exceed the importer limit.

**Recommendation:** define a supported portable-state size and enforce a coherent export/import policy. Any queue the app can export as a supported backup must import again. For larger states, progress edits and reorder actions should retain inverse changes or share immutable source lists instead of copying all metadata. Imports can keep a full restore checkpoint subject to an explicit budget. Never trim source episodes silently to make a file fit.

Before named alternatives or larger histories, address the previously documented stale-tab overwrite and rejected-save recovery issues in `improvement-review-2026-10-26.md`. `flushSave` and `loadState` still have those responsibilities. A new persistence module should own compare-before-write, external-change notices, raw rejected-save recovery, quota handling, and the distinction between current state and optional history.

## Simplification taken seriously

The current orchestration mixes mutable globals, form values, derived media hours, rendering, saves, and Undo. Splitting the file mechanically would distribute that coupling without removing it. A framework replacement would also leave the measured large-DOM and repeated-forecast costs intact unless its update behavior changed.

Use a few deep modules with small interfaces:

| Module | Interface sketch | Behavior kept inside |
| --- | --- | --- |
| Queue | `apply(snapshot, command) -> {snapshot, change}` | Progress, personal runtime corrections, completion/restore, ordering, stable identity, inverse edits |
| Planner | `createPlanner(snapshot, today)` returning `forecast(overrides)` and `previewAppend(item, overrides)` | Schedule compilation, dated episodes, runtime assumptions, podcast projection, launch consumption, requested interval detail, revision-scoped reuse |
| Persistence | `load()`, `save(snapshot, expectedRevision)`, `export(snapshot)`, `import(text)` | Existing codecs, validation, conflict detection, recovery copies, quota/history budgets, supported file sizes |
| Catalog | `search(query, kind, signal)`, `resolve(result, signal)` | Provider pacing/cache, identity, provenance, cancellation, resolution lifetime and manual fallbacks |

The existing pure core is a good starting implementation for Planner and the portable codecs. Keep it. The DOM renders a snapshot and derived results; quick and detailed time controls dispatch the same changes. A forecast should not have to synchronize mutable queue hours before it can answer a question. Date-derived effective hours need one defined owner and one policy for what is persisted.

The Planner instance belongs to an immutable snapshot/revision and calendar day. Changes create a new instance or explicitly invalidate affected cached sources. It must not retain old podcast projections, stale target dates, or previous progress across async provider updates. Queue commands must finish pending field edits against the item's stable ID before moving it.

These interface sketches are design proposals, not an instruction to introduce four new files immediately. Extract where a responsibility becomes easier to own and test. Use adjacent classic scripts where an extraction helps; direct-file startup must continue to work without fetching a sibling data file or introducing a required loader/build. Keep browser tests at user-visible behavior and core tests through these interfaces.

### What I would cut

- Cut repeated summaries of the same forecast. Let the coverage chart and one comparison carry the answer. Put source/progress detail in the selected item's editor.
- Cut whole-list replacement for unchanged Plan rows and local edits.
- Cut repeated baseline forecasts and per-candidate queue copies in the append case.
- Cut full source-metadata duplication from every small Undo operation and saved scenario.
- Consider removing the dormant optional RAWG integration only after deciding whether its manually configured-key path is still wanted. An empty shipped key is evidence of a dormant path, not proof that no owner uses it.

### Extreme alternatives I would decline

| Alternative | Why it loses here |
| --- | --- |
| Replace the whole app with a chat/recommendation feed | Less direct control over queue order and assumptions; new inference/service dependencies without solving the coverage calculation |
| Manual-entry-only app | A real reduction in provider complexity, but loses the lookup and per-video/episode detail that makes progress useful |
| Rewrite into a new UI framework immediately | No measured evidence that framework choice is the constraint; still needs bounded DOM and forecast reuse |
| Event-source every interaction forever | Adds replay, schema migration, compaction, and recovery obligations; bounded inverse edits solve the demonstrated Undo problem more directly |
| Add more providers before reorganizing planning | More failure paths while the current provider lifetimes and manual fallbacks already require care |
| Treat all items as total hours and discard availability | A smaller implementation with incorrect coverage whenever future episodes block playback |

The radical simplification worth pursuing is fewer authoritative representations and fewer calculations. Smaller source size may follow, but this investigation does not establish a safe percentage of code to delete.

## Suggested implementation order

1. **Remove known repeated work and align backup limits.** Retain unchanged Plan rows, add the append-summary path with equivalence tests, and establish an export/import size contract. A supported generated backup must round-trip. Do not silently reduce the accepted source data.
2. **Make state and identity explicit.** Introduce stable IDs, consolidate schedule edits, move small edits toward inverse Undo, and handle save conflicts/recovery. Verify current/legacy files, provider refreshes, corrections, focus, and Undo on both protocols.
3. **Build the workbench.** Compare a selected batch of additions and the inverse pace question. Accept a proposal in one action. Keep full-queue forecasting while bounding visible rows for extreme libraries. Target under 50 ms of local work for ordinary edits and search paints on the documented large fixtures; these are proposed engineering targets, not results already achieved.
4. **Prototype availability-aware interleaving.** Reproduce the 14-day example, preserve per-title progress, and compare exact intervals against strict order. Ship it only as an explicit policy with understandable assumptions and gaps.
5. **Expand to named alternatives and dated budgets.** Add the matrix after compiled forecasts can support it. Export chosen alternatives with versioned validation and prove their restoration. Keep each accepted change reviewable and reversible.

Step 1 is implemented. The next engineering step is to make state and identity explicit before building the workbench. The bolder product bet is step 4. Both support the same direction, and neither requires abandoning the static site.

## Verification and limits

- The dependency-free core and playlist-reader suites pass after the follow-up changes.
- The new benchmark ran in isolated Chromium 156.0.8078.47 contexts on both static HTTP and direct-file URLs, at 1280 by 900, America/Chicago, reduced motion, with external requests blocked. Date is pinned to September 22, 2026; `performance.now()` remains real. No user's saved browser profile is used.
- Each operation has one warm-up and five measured samples. The raw report includes samples, inclusive function timings, markup-write counts, snapshot sizes, import feedback, and the tested append-equivalence count. Inclusive function times overlap and must not be summed.
- The capped-row experiment excludes forecast construction by reusing a precomputed full-queue result. It temporarily renders only the first 100 items; it does not implement pagination, global filtering, or keyboard navigation for hidden rows. Its results show a possible work reduction rather than a shipped interaction.
- The Plan-row benchmark compares a normal unchanged render with a forced row rebuild using the production cache invalidation key. The large dated-show case still pays for its baseline forecast; it does not claim that forecast computation is cached.
- The append experiment calls the production `previewAppend` implementation and covers immediately available positive-hour additions at the end. It does not establish correctness for reordering, inserting before waits, adding dated episodes, or interleaving.
- `tests/portable-save.test.cjs` confirms that a generated backup above the old 1,000,000-byte ceiling round-trips and that files above 10 MiB are rejected on both static HTTP and direct-file URLs.
- No live-provider reliability claim, mobile hardware performance claim, visual audit, or whole-app regression pass is made. The application runtime was not edited for this investigation.

Run the investigation again with the optional Playwright/Chromium setup documented in the README:

```sh
xvfb-run -a env NODE_PATH=/tmp/gta-queue-check/node_modules node tests/extremes-benchmark.cjs
```

During this session Playwright was already available under `/tmp/gta-queue-improvement-audit/node_modules`, so that path was used instead. No package installation or runtime dependency was added.
