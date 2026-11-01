# Simplification results

## Starting point and plan

Work began from the current working files, not HEAD. `git status --short` showed an edited `index.html` and untracked `AGENTS.md`, `CONTEXT.md`, `README.md`, `docs/`, `test-results/`, `tests/`, and `time-bridge-core.js`. The existing index diff was 2,497 additions and 408 deletions. Its diff and copies of the initial runtime and tests are preserved under `/tmp/gta-simplification-start*`. No existing work is being reset.

The runtime starts at 253,607 bytes and 4,678 lines across `index.html` and `time-bridge-core.js`. This includes HTML, inline CSS, catalogs, and JavaScript. Runtime and test sizes will be reported separately.

Evaluate the seven opportunities in order:

1. Share render calculations and candidate coverage.
2. Separate queue actions from row construction.
3. Consolidate media calculations and measure hidden rendering/change tracking.
4. Put portable state encoding and parsing behind a DOM-independent interface.
5. Share common date, playlist URL, and request handling where useful.
6. Remove confirmed dead code and consolidate overridden CSS.
7. Share browser test setup and replace applicable snippet tests with interface tests.

Run focused checks after each step, then all README suites, repeat the baseline measurements, and compare desktop/mobile screenshots and keyboard behavior.

## Baseline verification

Commands started before runtime edits:

```sh
node tests/time-bridge-core.test.js
node tests/playlist-reader.test.cjs
xvfb-run -a env NODE_PATH=/tmp/gta-queue-check/node_modules python3 <suite-runner>
```

The suite runner executed all ten README browser suites sequentially and captured each result to `/tmp/gta-baseline-<suite>.log`. All passed for both HTTP and file URLs. Core: 50/50; playlist reader: 2/2. No pre-existing failures were found.

`xvfb-run -a env NODE_PATH=/tmp/gta-queue-check/node_modules node tests/simplification-benchmark.cjs baseline` produced `test-results/simplification-baseline.json` and desktop/mobile screenshots under `test-results/gui/`. Chromium 153.0.8010.52; America/Chicago; fixed clock 2026-09-22 at noon; 1280×900 timing viewport; reduced motion; isolated storage; external requests blocked. Three warm-up renders and ten measured samples per fixture. Boundaries cover synchronous rendering and DOM writes, excluding layout/paint, debounced saves and provider latency. Inputs: simple mode, 21 h/week, 1 h/day recurring YouTube, start September 22, job date October 1, reading pace 190 pages/hour. Movie fixtures use 2–8 hours; the episode fixture has 25 shows of 1,000 half-hour episodes each.

Ten previews built ten schedules and twenty full forecasts. Ten forced renders built twenty schedules, ten full forecasts and ten queue rebuilds. Collapsed mutation renders still rebuilt all ten times. Median forced/unchanged/collapsed timings in milliseconds:

| Fixture | Forced | Unchanged | Collapsed mutation |
| --- | ---: | ---: | ---: |
| 25 items | 2.25 | 0.30 | 1.85 |
| 100 items | 6.45 | 0.30 | 5.80 |
| 500 items | 26.45 | 0.25 | 23.25 |
| 25 shows × 1,000 episodes | 9.40 | 3.70 | 9.65 |

Collapsed height: 52px at 1280 and 54px at 390. Mobile Add item height: 44px.

The collaborative T3 preview reported no available automation. Opening the file failed, opening a background tab returned `available:false`, and navigation failed on that client. Existing headless Chromium regression tools remain available. The initial browser command was blocked by a local hook requiring a virtual display; it was corrected to run through `xvfb-run`.

## Progress

### 1. Shared calculations: complete

Added totals-only coverage to the core. A short-lived context captures the clock, schedule, job, start and recurring YouTube inputs and supplies one plan/forecast to render consumers. Search paints share one totals baseline across ten candidates, with no extended queue copies or timeline allocations. Row week labels reuse forecast endpoints. Scenario runtime variants use totals while their visible timeline keeps its distinct forecast and target/podcast assumptions.

Verification: core suite 51/51; coverage suite passes HTTP/file, including new comparisons against the original full-forecast candidate outputs for empty and zero-hour queues, stalls, delayed starts and job transitions. `simplification-benchmark.cjs step1` measured ten previews at **one schedule, zero full forecasts**, versus ten/twenty. Ten forced renders now build ten schedules, versus twenty. Collapsed queue work remains for opportunity 3.

### 2. Queue actions: complete

Rows now construct markup without selector scans or handler installation. Queue, Continue next and Completed containers own delegated handlers. Explicit progress, estimate, finish, remove, restore and reorder actions share commit coordination. Estimate and playlist value edits keep existing rows and inputs. Continue next calls the game/show/playlist actions directly. `addToQueue` takes an item object, with internal callers and browser fixtures updated together. Async show/video loading follows item identity and retains loading controls after reordering; removed results do not change the queue or its feedback.

Verification: core 51/51; queue-actions, playlist-progress, static-optimization, coverage and static-browser pass on both protocols. Added focused browser checks for zero-hour game edits and Continue focus, archived reading progress/Restore, and pending show lookup reorder/removal. Game/show progress calculations moved to core interfaces, replacing their corresponding VM snippet checks ahead of opportunity 7 because those snippets were removed by this step. Existing Undo policies remain: add/reorder/load have no checkpoint; each supported edit has one; playlist refresh checkpoints only changed items and renders/saves at the batch boundary.

### 3. Repeated state walks and hidden work: complete

One queue pass now synchronizes games, unpinned reading estimates and ongoing podcasts through core calculations. Rules remain explicit: calibrated reading pace survives corrections; pinned values stay fixed; podcast source hours round before scaling; zero game hours remain active. Progress actions use the same remaining-time functions.

Replaced full queue/archive JSON render signatures with state/history revisions plus the existing scalar schedule, target and calendar-day key. Commits, imports, Undo, source refresh bookkeeping and changed derived values invalidate state. Collapsed mutations still calculate forecasts and save, but defer row markup and catch up synchronously on reopening. Completed and timeline already deferred hidden markup; that behavior was retained.

Kept these changes because measurements justify them: episode-heavy unchanged render median fell from 3.70ms to 0.20ms, and collapsed 500-item mutation median fell from 23.25ms to 0.30ms. Ten collapsed mutations rebuild zero queues, versus ten initially. Full JSON serialization remains where it is needed for portable saves and bounded Undo.

Verification: core 52/52; static-optimization, playlist-progress, queue-actions, coverage, game-picker and compact-layout pass on both protocols. Added calibrated/pinned/rounding checks and a controlled midnight test verifying podcast recalculation, completion dates, saves while collapsed and immediate catch-up. Collapsed heights remain 52px/54px and mobile Add item remains 44px.

### 4. Portable state: complete

The core now encodes an explicit snapshot containing queue, Completed, schedule, target and save time. The browser reads/applies forms and retains storage and Undo handling. The parser splits document sections once and uses one row validator for Queue and Completed. Completed additionally requires its table header and completion dates. There is no recursive document reconstruction or new format/migration.

Verification: core 53/53 and reader 2/2; static-browser, static-optimization, fanfiction, coverage and game-picker pass on both protocols. Added DOM-independent all-media round trips, escaped titles, zero-hour games, calibrated estimates, noncontiguous watched identity, CRLF files, immutable snapshots and malformed rows in either section. Existing tests retain legacy markers/files, target restoration, atomic import rejection, bounded Undo and quota recovery.

### 5. Validation and requests: complete

Shared date parsing preserves the local-midnight browser date and UTC validation semantics, with a separate 1900 minimum for release targets. A shared playlist URL parser retains accepted HTTPS hosts/IDs, while story routing keeps its broader HTTP/HTTPS handling.

Five fetch paths share timeout lifetime and cancellation cleanup, including response-body parsing. JSON caching/pacing/429 handling, story direct/Reader fallback, playlist no-cache/full-data validation and oEmbed title errors remain explicit. Podcast sandboxing and the YouTube player lifecycle remain specialized. A selected lookup still has its own lifetime, independent of later search cancellation.

Verification: core 55/55, static-optimization, fanfiction, playlist-refresh, static-browser, add-flow and game-picker pass both protocols. New focused checks cover calendar/year bounds, all accepted playlist hosts and invalid URLs, already-aborted signals, ignored-cancellation late results, listener cleanup, timeout messages and source failures.

### 6. Dead code and CSS: complete

Reference searches found no runtime/test callers of `dayForHourFull`, its full-pace support values, or catalog `extra`/`complete` fields. Removed those, the unreachable stalled copy inside the behind verdict and the obsolete sequential YouTube segment styles. Kept every catalog entry/main runtime/alias, source-quality comments, current recurring YouTube row and all live motion/drag/SVG styling.

Consolidated four overlapping mobile rule blocks into the final mobile cascade, retaining the winning three-column queue. Removed overridden suggestion colors. An early mobile bridge margin was already overridden by its later base rule, so consolidation keeps the original winning margin.

Verification: core 55/55; compact-layout, coverage and game-picker pass HTTP/file. Compared computed styles at 1280/390 across regular, active, hover, keyboard, collapsed, expanded and reduced-motion states against the preserved original runtime: no differences. The first style capture failed on a nonunique neon-light locator; corrected it with `.first()`. Captures now wait for color transitions/media-change delivery before comparing. Evidence: `test-results/simplification-baseline-css.json`, `test-results/simplification-step6.json` and screenshots under `test-results/gui/`.

### 7. Test maintenance: complete

All ten browser suites use `tests/browser-fixture.cjs` for static server startup, Chromium configuration, HTTP/file loops, isolated storage, page-error collection and cleanup on failures. Per-suite viewport/motion settings and controlled network hooks remain available. Failure screenshots go to `test-results/gui/`. Tests no longer parse HTML offsets or execute implementation snippets in a VM. Core behavior uses exported interfaces; DOM behavior stays in browser suites.

Replaced the remaining source-shape checks with actual season/episode control behavior, default heading/export download filename, playlist form/direct-file disclosure and controlled service responses, and Royal Road missing-chapter rejection followed by successful manual addition. Existing domain, import, provider, focus, progress, storage and motion coverage remains. The core count is now 51: five focused core cases were added, four former DOM/source-shape cases moved to browser suites, and the existing VM cases were rewritten through interfaces.

Verification: all ten browser suites passed after fixture extraction. The changed behavioral suites also passed after moving assertions. A final review identified that delegated estimate commits must blur before reordering; fixed that ordering and added a regression preserving the edited item's identity. Late candidate paints also synchronize date-derived hours before calculating coverage, covered by the controlled midnight test. Separate intentional network-hook and assertion failures confirmed that the fixture closes its browser, contexts and server on failure.

## Final verification: complete

All seven opportunities are implemented. No runtime files, dependencies, server requirements or build steps were added. The working tree retains the starting uncommitted work. README now documents the shared browser fixture and repeatable benchmark.

The final checks ran after the focus/reorder and late-result/date fixes:

```sh
node tests/time-bridge-core.test.js
node tests/playlist-reader.test.cjs
for suite in static-browser static-optimization playlist-progress playlist-refresh fanfiction add-flow queue-actions compact-layout coverage game-picker
do
  xvfb-run -a env NODE_PATH=/tmp/gta-queue-check/node_modules node "tests/$suite.test.cjs"
done
xvfb-run -a env NODE_PATH=/tmp/gta-queue-check/node_modules node tests/simplification-benchmark.cjs final
```

Core passed 51/51; playlist reader passed 2/2. Each of the ten browser suites passed both static HTTP and direct-file loading, with no collected page errors. Logs are in `test-results/simplification-logs/final-*.log`; suite exit codes are in `test-results/simplification-tests.json`.

Together these checks cover the game picker/manual date fallback, current/legacy export/import, atomic rejection, target restoration, Undo/quota recovery, Completed/Restore, watched video identity, manual/forced refresh and incomplete-data rejection, search cancellation and selected lookup lifetime, temporary scenarios, hidden-page pause/resume, midnight/date changes, queue collapse/reopen, keyboard/pointer reorder, focus/caret preservation and held playlist spinners. Providers use controlled responses. This verifies application behavior without claiming current live service availability.

### Measured work and timing

Final measurements reused the baseline clock, inputs, fixtures, browser version, warm-up/sample counts and timing boundaries. Raw samples and call counts are in `test-results/simplification-baseline.json` and `test-results/simplification-final.json`.

| Work, across ten calls | Before | After |
| --- | ---: | ---: |
| Schedules for ten candidate previews | 10 | 1 |
| Full forecasts for ten candidate previews | 20 | 0 |
| Schedules for ten forced renders | 20 | 10 |
| Full forecasts for ten forced renders | 10 | 10 |
| Queue rebuilds for ten forced renders | 10 | 10 |
| Queue rebuilds for ten collapsed mutations | 10 | 0 |

The final collapsed renders still build ten schedules and full forecasts, so hidden-row savings do not skip calculation or saving. Candidate output comparisons pass against the original full-forecast method, including zero hours, empty queues, stalls, delayed starts and job transitions.

Median synchronous milliseconds, before → after:

| Fixture | Forced | Unchanged | Collapsed mutation |
| --- | ---: | ---: | ---: |
| 25 items | 2.25 → 1.85 | 0.30 → 0.30 | 1.85 → 0.25 |
| 100 items | 6.45 → 4.50 | 0.30 → 0.20 | 5.80 → 0.20 |
| 500 items | 26.45 → 20.55 | 0.25 → 0.20 | 23.25 → 0.20 |
| 25 shows × 1,000 episodes | 9.40 → 8.65 | 3.70 → 0.20 | 9.65 → 0.30 |

These are local measurements of synchronous work, not end-to-end frame or network timings. The unchanged 25-item median shows no improvement. Call counts demonstrate the removed work independently of timer noise.

### Source sizes

Counts use raw file bytes and `splitlines()` over all runtime files and all top-level `.js`/`.cjs` test sources. Data fixtures and generated evidence are excluded from test code.

| Source | Before bytes | After bytes | Change | Before lines | After lines | Change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Runtime, two files | 253,607 | 254,477 | +870 | 4,678 | 4,696 | +18 |
| All test code, 12 → 14 files | 124,276 | 132,291 | +8,015 | 2,199 | 2,396 | +197 |
| Regression tests and shared fixture, excluding new benchmark | 124,276 | 123,975 | −301 | 2,199 | 2,254 | +55 |

The new repeatable benchmark is 8,316 bytes and 142 lines. Runtime source grew 0.34%; this work does not claim a smaller total implementation. It removes repeated calculations, handler installation and parser/setup duplication while adding focused edge-case coverage and measurement code.

### Appearance and interaction evidence

Matched final desktop/mobile screenshots are pixel-identical to captures from the preserved original runtime using the same benchmark capture sequence. Compare `gui/simplification-baseline-css-1280.png` with `gui/simplification-final-1280.png`, and the corresponding `390` files. Desktop captures are 1280×1561; mobile captures are 390×2253. An older mobile baseline used a different focus/save capture state, so its raw difference is not an appearance comparison.

Computed-style comparisons also match exactly for the captured selectors/properties at both widths across expanded/collapsed, hover, active, keyboard focus and both motion settings. Collapsed queue height remains 52px at 1280 and 54px at 390. Mobile Add item remains 44px. Browser tests confirm Add item reopens and focuses the input, motion respects reduced-motion settings, and background work pauses/resumes. Additional queue and scenario screenshots are saved as `gui/simplification-queue-*.png` and `gui/simplification-coverage-*.png`, all under `test-results/`.

### Verification gap

The T3 collaborative preview remains unavailable. `preview_status` reported no automation client; `preview_open` for the direct-file page failed, its background-tab fallback returned `available:false`, and `preview_navigate` failed on that client. Product-native preview verification therefore did not pass. Available headless Chromium checks and saved screenshots cover both protocols and the requested interaction/layout behaviors. There are no unresolved implementation steps or failing available regression checks.
