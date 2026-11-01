# Release Queue overhaul checklist

Updated: 2026-09-30. Two implementation passes remain after the current tested stopping point.

## Scope and constraints

Improve daily use and simplify maintenance. Preserve the approved Vice City neon design, direct-file use, ordinary static hosting, existing saved data, and portable Markdown backups. Keep the site browser-only with no required build step or backend. Reduce duplication and unnecessary work without sacrificing readable code.

For delegated work, use GPT-6.1 Sol subagents at low or medium reasoning effort, as requested.

## Completed foundation

- [x] Compact the countdown and move the queue higher on the page.
- [x] Make the timeline expandable and build its segments only when opened.
- [x] Move export/import controls above the queue.
- [x] Make the time-budget editor expandable and add a numeric weekly-hours field.
- [x] Route supported playlist and story URLs from the main add field.
- [x] Explain the required media type when adding a manual title.
- [x] Show lookup errors beside the affected queue action.
- [x] Add Continue next progress actions and next-video links when video IDs are available.
- [x] Preserve playlist check timestamps across reloads.
- [x] Remove the footer disclaimer, duplicate countdown, and unused example controls.
- [x] Pass focused HTTP and direct-file checks for layout, add flows, queue actions, playlists, and story progress.

## Phase 1: Code cleanup and performance

- [ ] Review repeated queue handlers, progress updates, and feedback code; consolidate where behavior is genuinely shared.
- [ ] Remove remaining unused CSS, markup, JavaScript, and stale comments.
- [ ] Check rendering during edits, refreshes, and periodic updates; avoid rebuilding unchanged or hidden content.
- [ ] Measure startup and interaction behavior with a representative long queue before and after changes.
- [ ] Preserve focus, Undo, autosave, and old-save compatibility through refactoring.
- [ ] Run the core and relevant browser regression suites after changes.
- [ ] Record concrete code reductions or performance improvements and any remaining limitations.

Stopping point: cleanup is complete, relevant checks pass, and no partial refactor remains.

## Phase 2: Final usability and regression pass

- [ ] Inspect settled desktop and mobile layouts, including empty, short, and long queues and long titles.
- [ ] Check expanded forms/settings, search results, row controls, and visible feedback for overflow and spacing problems.
- [ ] Verify keyboard navigation, focus after actions, reordering, and touch targets.
- [ ] Verify reduced motion and the saved background-pause preference.
- [ ] Exercise manual add, title search, playlist/story URLs, progress, completion, restore, and Undo.
- [ ] Exercise failed lookups, retries, stale playlist responses, and unavailable services without losing saved progress.
- [ ] Verify old saves, reloads, Markdown export/import, and Undo after import.
- [ ] Run the full regression suite in both direct-file and static-server modes; fix failures introduced by the overhaul.
- [ ] Distinguish mocked provider checks from any live service checks in the verification notes.
- [ ] Update the README and project design notes to reflect the final behavior.

Stopping point: the agreed overhaul works end to end, visual checks are complete, and outstanding limitations are documented.

## Definition of complete

- [ ] Both remaining phases are finished, with verification results recorded.
- [ ] The six reviewed usability improvements work together in everyday use.
- [ ] The approved neon styling and static-site constraints remain intact.
- [ ] No known regression introduced by this work remains unresolved.

A larger rewrite or new feature set is outside this checklist. Committing or publishing is separate from implementation completion.
