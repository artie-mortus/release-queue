Run with GPT-6.1 Sol

Select `gpt-6.1-sol` in T3/Codex before sending the task below. High reasoning is recommended for this refactor's coupled state, rendering, and persistence changes. This is a task-specific recommendation; `high` is a supported setting in the [official GPT-6.1 Sol guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6.1-sol). Naming the model in a prompt does not change the session's selected model or reasoning setting.

Task

Refactor Release Queue to reduce duplicated code and unnecessary computation while preserving its current user experience. Work in `/home/artemis/Projects/release-queue`. Implement the improvements below in small, verifiable steps. This authorizes implementation and verification. Continue through all seven opportunities and final verification; a plan or the first completed opportunity alone is not the deliverable.

Read `AGENTS.md`, `README.md`, the current `index.html`, `time-bridge-core.js`, and relevant tests first. Preserve existing uncommitted work. Consult `docs/static-optimization-audit.md` for optimizations already implemented; its historical line numbers and timings are not a current baseline.

Execution

- Inspect `git status` and existing diffs before editing. The current working files, including untracked files, are the starting point. Confirm each opportunity against those files; function names and measurements below are navigation clues and prior observations.
- Keep a short plan covering all seven opportunities. Record the baseline, decisions, commands and results, remaining work, and next step in `docs/simplification-results.md`. Update it after each completed step so work can resume after context compaction without repeating the baseline or losing requirements.
- Establish the baseline described under Verification and completion before changing runtime code. For each opportunity, inspect its callers and tests, implement one coherent change, and run the relevant behavioral checks. Fix regressions introduced by that change before proceeding to dependent work.
- Make routine implementation decisions and continue without requesting approval between steps. Ask only when missing information materially affects correctness and cannot be resolved from the repository. Continue independent work while awaiting an answer.
- Evaluate every opportunity. Retain changes that remove real duplication or measured work while preserving behavior. Record an evidence-based reason when a proposed change is already implemented, adds more complexity than it removes, or cannot be verified. Mark unresolved work as incomplete.

Constraints and compatibility

- Keep direct-file loading and ordinary static hosting. Use browser-side HTML, CSS, and JavaScript with no required build step, framework, backend, database, or private server credentials. Any extracted runtime files must load through ordinary local script or stylesheet links compatible with `file://`. Follow the existing classic-script/core-wrapper pattern and preserve dependency order when extracting JavaScript.
- Preserve appearance, copy, responsive layouts, keyboard behavior, focus, progress controls, feedback, and motion. Retain the searchable game picker and manual date fallback, temporary scenarios, and compact collapsible queue. The collapsed queue is currently 52px tall at a 1280px viewport and 54px at 390px; Add item reopens it and focuses the input.
- Preserve all media providers and their fallbacks, schedule and rounding rules, current storage keys, legacy saves, Markdown exports, target metadata, Completed, and Undo. Import validation must remain atomic. Keep the existing distinction between zero remaining game hours, an item reaching completion, and invalid data.
- Use small modules with useful interfaces. Moving code into more files, minifying it, or replacing explicit logic with a generic framework does not by itself satisfy the task. Add abstractions only where they replace real duplication.

Implement these opportunities in priority order

1. Share calculations across a render and across search-result previews.

   Inspect `render`, `buildSchedule`, `currentForecast`, `renderBridge`, `renderQueue`, `syncQueueDerivedState`, `queueWeekLabels`, `renderScenarios`, `renderPicks`, and `candidateCoverage` in `index.html`, plus `forecastQueue` in `time-bridge-core.js`.

   `candidateCoverage` currently builds a schedule and computes two full forecasts per candidate. A browser check of ten valid candidate previews produced ten schedule builds and twenty full forecasts. Those forecasts allocate timeline segments and determine queue position even though the preview only uses totals, capacity, finish time, and stall status.

   Read the clock and schedule inputs once per update. Share the current plan, totals, and forecast among consumers. Compute candidate coverage from shared baseline values and `dayForHour` without constructing a full extended queue forecast for every result. Reuse calculated segment endpoints for row week labels where their meaning matches. Use short-lived computation contexts so date changes, target changes, progress edits, and async results cannot leave stale forecasts. Retain the distinct scenario assumptions and outputs.

   Verify candidate outputs against the existing full-forecast behavior with controlled clock and schedule inputs, including empty queues, zero hours, stalls, delayed starts, and job transitions. Count schedule builds and full forecasts for the same ten-preview fixture before and after; preview count should no longer multiply full-queue forecasts.

2. Separate queue actions from row construction.

   `renderQueue` is roughly 300 lines and combines row markup with repeated selector scans and per-row handler installation. Related mutations appear in `renderQueueSummary`, `setShowProgress`, `renderHistory`, and playlist refresh.

   Attach delegated handlers once to stable containers. Extract explicit actions for progress, estimates, completion, removal, restore, and reorder. Let Continue next call those actions directly instead of assigning a DOM input and invoking its `onchange` handler. Centralize repeated checkpoint/mutation/invalidation/render/save coordination while preserving which operations currently create Undo snapshots and when a batch commits. Replace the positional `addToQueue` argument chain with an explicit item/options object if that removes caller complexity; update internal callers and tests together.

   Keep asynchronous results associated with the item they belong to after reordering or removal. Preserve held playlist spinners, caret position, blur-before-remove behavior, keyboard reorder focus, and completion/restore progress. Use `focusout` or capture deliberately when replacing non-bubbling blur handlers. Reuse existing rows for value-only updates without introducing a custom virtual DOM.

3. Reduce repeated state walks and hidden rendering.

   Consolidate the genuinely shared item calculations spread across `syncGames`, `syncBooks`, `syncPodcasts`, `calculatedHours`, and progress handlers. Keep media-specific rules explicit, including runtime corrections, pinned estimates, reading pace, podcast growth, and watched video identity.

   After mutation paths are centralized, evaluate replacing the full `JSON.stringify(queue)` and `JSON.stringify(completed)` render signature with simpler change tracking. Retain correct invalidation for imports, Undo, async refresh, day rollover, target changes, and schedule edits. Defer hidden queue/Completed/timeline markup and handler work until needed while continuing required calculations, saves, and refresh bookkeeping. Reopening must catch up immediately. Keep this change only if measured savings justify its complexity.

4. Simplify the portable-state implementation.

   `serializeState` and the media-cell encoders live in `index.html`, while parsing lives in `time-bridge-core.js`. Give the format one DOM-independent implementation that accepts an explicit state snapshot; keep reading and applying form values in the browser layer.

   `parseStateText` currently creates another Markdown document and recursively reparses it to load Completed. Parse document sections once and use a shared row parser for Queue and Completed, applying each section's validation rules. Preserve format markers, escaped titles, metadata, legacy files, target restoration, runtime corrections, and rejection of malformed archives. Keep the existing bounded Undo history and quota-recovery behavior. Avoid a new persistence format or migration for this refactor.

5. Consolidate small, repeated validation and request mechanisms.

   Review date handling in `fromDateValue`, `validDateValue`, and `validateReleaseTarget`, and playlist URL handling in `addUrlInput` and `parseYouTubeCell`. Share the common parsing while preserving caller-specific year ranges, local-midnight countdown semantics, accepted hosts, protocols, and invalid-input behavior.

   Review repeated timeout/AbortController/cleanup code in `fetchJson`, `fetchStoryText`, playlist readers, and title lookup. Extract a small fetch mechanism only where it removes duplication. Keep source-specific timeouts, response parsing, cache policies, errors, and fallback order explicit. Preserve provider pacing, 429 cooldowns, cache bounds, stale-response rejection, and the distinction between canceled searches and already-selected item lookups. Keep podcast JSONP sandboxing and the YouTube player lifecycle specialized. Forced playlist refreshes must still bypass cached results and reject incomplete fallback data.

6. Remove proven dead code and redundant CSS.

   Audit references before deleting anything. Candidates include the unused `dayForHourFull` calculation and its supporting values, unused catalog `extra`/`complete` fields, and the unreachable stalled branch inside the `behind` verdict case. Keep live catalog entries, aliases, provider behavior, and explanatory comments that document real constraints.

   Consolidate overridden suggestion colors and overlapping 560px media rules. For example, the earlier mobile four-column `.item` grid is replaced by a later three-column rule. Preserve the winning computed styles and cascade order across hover, focus, reduced motion, and expanded/collapsed states. Confirm dynamic classes and inline SVG references before treating them as unused.

7. Simplify test maintenance without weakening coverage.

   Browser suites repeat static-server setup, Chromium launch, HTTP/file URL loops, error collection, and teardown. Extract a small shared fixture with per-suite viewport and network hooks. Preserve isolated storage, controlled provider responses, and cleanup on failures.

   Several tests in `tests/time-bridge-core.test.js` extract implementation snippets from HTML using string offsets and execute them in a VM. As those behaviors move behind module interfaces, test them through those interfaces and retain browser tests for DOM behavior. Replace brittle source-shape assertions with equivalent behavioral assertions. Keep the suite's ability to detect regressions.

Verification and completion

- Record a baseline before editing runtime code: runtime source bytes and lines, existing test results, schedule/forecast call counts for ten candidate previews, queue rebuild counts, and representative timings for 25/100/500 items plus an episode-heavy queue. Use repeatable fixtures, not live provider latency, for comparisons. Record the clock, inputs, browser version, viewport, warm-up, sample count, and timing boundaries. Reuse them for the final comparison and count all extracted runtime files in source-size totals.
- Run the dependency-free tests and all existing browser regression suites listed in README before and after the completed refactor. Run relevant checks between steps. Record pre-existing failures separately. Add focused regression coverage only where the refactor exposes an untested behavior; do not add tests that merely assert the new source structure.
- Verify both static HTTP and direct-file loading, including the game picker, export/import, legacy saves, Undo, Completed/Restore, playlist identity and manual refresh, search cancellation, temporary scenarios, hidden-page pause/resume, midnight/date changes, and queue collapse/reopen.
- Compare representative desktop/mobile screenshots and keyboard flows. Confirm the compact collapsed queue and 44px mobile controls. Preserve reduced-motion and background-pause behavior. Use isolated browser storage and disposable fixtures; save substantial GUI evidence under `test-results/gui/`.
- If a check cannot run, record the exact command, failure, and verification gap. Continue checks that remain available. A missing tool or blocked check is not a pass.
- Finish with working code, updated documentation, and a completed `docs/simplification-results.md`. Account for all seven opportunities with their changes or evidence-based deferrals. Report runtime and test-code size changes separately, measured work/timing changes, tests run, and unresolved verification gaps. Claim improvement only from measured results. Prefer a smaller readable implementation, but do not trade correctness or usability for a line-count target.
