# Coverage improvements 2–6

Implemented and verified 2026-10-05 against the existing working copy. The user selected improvements 2–6 and rejected the Neon Road idea. The countdown retains its purpose of showing time until release; the queue forecasts whether entertainment fills that wait.

## Result

- The verdict reports missing entertainment hours beside the calendar gap, or queue hours remaining at launch. Placeholder runtimes make the result explicitly provisional.
- Known-runtime search results and manual entries preview how additions change coverage. A sticky Add item control stays reachable while scrolling a long queue and focuses the existing add field.
- Timeline segments use the same reduced pace as the finish estimate and launch-day position. Recurring YouTube is deducted throughout each item instead of appearing as a sequential block after the queue. Segment descriptions include projected finish dates.
- Queue rows identify saved runtimes, reading/feed estimates, local game estimates, and personal corrections. The game catalog no longer claims verified HowLongToBeat data.
- Temporary pace/date scenarios have a separate preview timeline and shorter/current/longer runtime comparisons. The real target and countdown remain fixed. Use this pace changes only the weekly budget, with Undo. Reset preview restores current assumptions. Preview inputs are not serialized or saved.
- Playlist refreshes preserve watched entries by video ID when both reads provide IDs. Noncontiguous progress survives reload, export/import, and Undo. Continue next uses the first unwatched entry. Changed refreshes create Undo checkpoints and preserve custom runtime corrections. Saves also flush on pagehide.

## Deliberate limits

- Runtime variation is an explicit assumption, not a calibrated probability. Saved video runtimes stay fixed; corrections and estimates may vary.
- Ongoing podcasts project to the preview date. Saved TV episode lists remain fixed, with that limit stated in the preview.
- Sources without video IDs use positional progress and disclose it. They cannot safely replace a playlist whose watched entries are noncontiguous, so that saved data is retained on an incomplete lookup.
- Duplicate video IDs use occurrence order within each ID to reconcile repeated entries. The source does not provide a permanent identity for each duplicate occurrence.
- Changing the watched count marks the first N entries in the current order as watched. Continue next preserves individually reconciled entries.
- The application remains browser-only with classic scripts, direct-file use, static hosting, and legacy save compatibility. No required build step or backend was introduced.

## Verification

All 49 tests in `tests/time-bridge-core.test.js` and both tests in `tests/playlist-reader.test.cjs` passed. Five new core cases cover coverage calculations, job/delay/stall behavior, identity reconciliation, duplicate occurrences, and save validation.

All nine browser suites passed in static HTTP and direct-file modes:

- `static-browser.test.cjs`
- `static-optimization.test.cjs`
- `playlist-progress.test.cjs`
- `playlist-refresh.test.cjs`
- `fanfiction.test.cjs`
- `add-flow.test.cjs`
- `queue-actions.test.cjs`
- `compact-layout.test.cjs`
- `coverage.test.cjs`

The new coverage suite checks timeline agreement with the reduced pace, gap and candidate feedback, isolated preview state, invalid inputs, applied pace and Undo, playlist insertions and identity progress, correction retention, unsafe refresh fallback, automatic completion after removal, reload/export/import, and reachable Add controls during long-queue scrolling.

Desktop and phone screenshots from the browser suites were inspected. Expanded scenario layouts were checked from 320 to 1920 pixels, with no document overflow. The compact layout check keeps the first row within its existing mobile threshold. Anti-slop and motion scanners and `git diff --check` passed.

Browser tests used blocked or controlled external responses. Live provider availability was not verified. Collaborative browser navigation opened the app, but its snapshot/evaluation calls repeatedly failed; visual verification used the existing headless regression suites' captures.

The project style lock and decision log record the rejected road design and the implemented controls awaiting visual review. The personal taste profile was unchanged.
