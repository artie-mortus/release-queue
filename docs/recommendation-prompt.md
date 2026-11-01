# Recommendation prompt copy

Added Copy recommendation prompt beside Export queue and Load file. The copied text begins with the requested instruction, lists the active queue in playback order with media types and remaining hours, and includes the current forecast's missing hours and selected release target. Recurring YouTube time appears separately because it runs alongside the queue. Empty queues, zero missing hours, unavailable queue time and passed release dates have explicit output.

The button takes a fresh calculation snapshot and commits a focused remaining-time edit before copying. Copying leaves queue order and Undo history alone; a pending estimate edit still creates its normal checkpoint. It first uses the browser clipboard API, then a selected textarea with the legacy copy command. If both are blocked, the textarea stays visible and selected for manual copying. Successful fallback copying returns focus to the button.

The existing native button styles and palette were reused. Mobile backup-button padding is 8px. Controls stay at least 44px tall and wrap when needed. Collapsed queue dimensions are unchanged. The Tastemaker decision log gained a pending-review entry; the style lock and personal profile were not changed.

Verification completed on 2026-10-06:

- `node tests/time-bridge-core.test.js`: 51 passed.
- `node tests/playlist-reader.test.cjs`: 2 passed.
- `xvfb-run -a env NODE_PATH=/tmp/gta-queue-check/node_modules node tests/recommendation-prompt.test.cjs`: passed static HTTP and direct file. Covers keyboard activation, ordered titles and media hours, exact controlled missing time, target metadata, recurring time, unchanged queue/Undo, successful legacy fallback, denied clipboard/manual selection, pending estimate commits, reorder, empty/full/stalled/released output, and widths 320–1920.
- The same command prefix with `tests/compact-layout.test.cjs`, `tests/static-browser.test.cjs`, `tests/coverage.test.cjs` and `tests/queue-actions.test.cjs`: all passed HTTP/file. The compact fixture's first row remains at 849.9375px.
- T3 collaborative preview: clicked the real button and read the clipboard back, confirming the full generated prompt. Verified 44px mobile height, no horizontal overflow, and selected manual fallback after controlled clipboard denial. Inspected desktop and mobile captures.
- Design scan, motion audit and `git diff --check`: passed. The final textarea focus rule reuses the existing focus token.

Evidence is under `test-results/gui/recommendation-prompt-{desktop,mobile,manual}.png`. Existing browser regression logs are in `test-results/recommendation-*.log`.

The first browser attempts found the previous temporary Playwright installation missing. Restored it with `npm install --prefix /tmp/gta-queue-check --no-save playwright`, outside the repository. Testing found and fixed fallback focus restoration and font-independent mobile action wrapping. Parallel virtual-display wrappers collided during teardown; final regression checks ran sequentially under one wrapper and passed. No test or runtime dependency was added to the static application.

The user requested a clearer button label. Renamed it to Copy recommendation prompt and removed the redundant accessible-name override. The prompt-copy and compact-layout suites pass on HTTP/file. With the longer label, mobile actions wrap onto an additional row; the compact-layout check still enforces the original content-height budget after accounting for that row. The 390px fixture's first row is now 901.9375px, with 52px from action wrapping.
