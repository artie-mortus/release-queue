# Release Queue improvement review

Reviewed the current working copy on October 26, 2026. The existing coverage previews, scenarios, playlist identity tracking, quick settings, and workspace redesign are already implemented. This review focuses on remaining opportunities. No application code was changed.

The owner subsequently selected items 2–5. Those changes are implemented in the working copy; see [implementation and verification](improvements-2-5.md). Item 1 remains outside this implementation.

## Recommended order

| Priority | Improvement | Why it matters | Relative effort |
| --- | --- | --- | --- |
| 1 | Protect saves from stale tabs and preserve damaged saves | Prevents silent replacement of recoverable user data | Medium |
| 2 | Respect TV episode availability in forecasts | A projected finish can currently precede the episode's airdate | Medium to large |
| 3 | Make the coverage tests independent of today's date | An existing regression suite has started failing as release approaches | Small |
| 4 | Explain placeholder runtimes before adding | The detailed notice currently appears inside a closed dialog | Small |
| 5 | Warn about duplicate additions | Repeated titles inflate coverage without warning | Small to medium |

These estimates describe scope, not delivery commitments. All changes can remain browser-only, with direct-file use and ordinary static hosting.

## Confirmed findings

### 1. Saves need conflict detection and a recovery path

Two tabs share browser storage but retain separate in-memory queues. I reproduced this sequence in both static HTTP and direct-file mode:

1. Save an original game, then open a second tab.
2. Add another game in the first tab and save.
3. Add a movie in the second tab and save.
4. The stored queue now contains the original game and the movie. The first tab's new game is absent, and no conflict notice appears.

`flushSave` writes the entire snapshot without checking whether another tab changed the saved value. `loadState` runs at startup; there is no storage-change listener. See [index.html](../index.html), functions `flushSave` and `loadState`, near lines 2491 and 2526.

Track the last loaded or successfully saved snapshot and compare it before overwriting. Detect external changes while the page is open. Offer reload and export of the current tab when there is a conflict. A hosted storage event can provide an early notification, but the write check must also work independently of that event for direct-file use. Automatic merging would need a separate design for stable item identity, ordering, progress, and Undo.

Recovery has a related gap. An invalid local save produces a visible warning, but changing the weekly budget then replaces the invalid text with the new empty queue and clears the warning. I reproduced this on both protocols. Preserve the raw rejected save before replacement and offer a recovery download. Keep recovery storage bounded and retain the existing priority of saving the current queue over optional history.

Acceptance: a stale tab cannot silently replace a newer save; a rejected save remains downloadable after a new valid save.

### 2. TV forecasts can finish episodes before they air

`showProfile` includes episodes scheduled before the target date, then saves only season, episode number, and runtime. The forecast treats all of those hours as immediately available. See [index.html](../index.html), `showProfile` near line 3202, and [time-bridge-core.js](../time-bridge-core.js), `forecastQueue` near line 386.

With a controlled TVMaze response containing one 60-minute episode airing ten days later, a 21-hour weekly budget produced a finish offset of 0.333 days. The saved episode had no airdate. This reproduced on both protocols; it does not depend on a live provider being available.

Retain episode availability dates and account for them when scheduling. Decide explicitly whether the queue waits for an unavailable episode or continues to the next available item. Until that policy exists, a smaller improvement is to separate currently available backlog from future scheduled runtime and disclose the forecast limitation. Existing saves without dates need a compatible fallback.

Acceptance: the forecast never presents an episode as consumed before its known airdate, and any resulting gap remains visible.

### 3. Coverage tests depend on the real calendar

The unmodified coverage suite fails at [tests/coverage.test.cjs](../tests/coverage.test.cjs), line 41, on October 26. It creates a 50-hour game at two queue hours per day, then expects the coverage note to contain the missing-hours value. At the current configured target, that queue already covers the wait, so the application correctly displays `2 hours of your queue remains at release.` rather than `0 hours`.

The same suite passes completely on both protocols when run with September 22, 2026 fixed as the browser date. Use a shared fixed clock for ordinary regression fixtures. Add deliberate near-release, release-day, post-release, midnight, and daylight-saving cases separately.

Acceptance: routine coverage checks pass regardless of the date they run, and calendar boundaries have explicit fixtures.

### 4. Placeholder explanations disappear with the add dialog

`addToQueue` closes the dialog on success. `choosePick` then writes its missing-runtime explanation into `estimateNote`, which is inside that closed dialog. The visible toast only says the title was added. The queue still correctly labels `Estimate needed`, so uncertainty is not entirely hidden.

I reproduced this with a movie whose runtime lookup returns an unknown two-hour placeholder. See [index.html](../index.html), `addToQueue` near line 2326 and `choosePick` near line 3302.

Show the proposed placeholder and an editable estimate before committing, or include the placeholder warning and an edit action in the visible success feedback. Preserve the existing provisional forecast label.

Acceptance: a user can see that a placeholder was used without reopening Add or inspecting row details.

### 5. Duplicate additions have no warning

Adding the same game twice creates two active rows and counts both runtimes. This reproduced on both protocols. Search results are deduplicated against each other, but `addToQueue` does not check the saved queue.

Use provider identity or normalized source URLs where available, and a media-kind plus normalized-title match as a fallback. Warn rather than block, since replays and different editions can be intentional. Offer to focus the existing item or add another copy. Completed items should be a separate, softer reminder.

Acceptance: repeated additions are visible and deliberate, including through story and playlist forms.

## Product experiments after the fixes

- **Dated time-budget exceptions.** Add a vacation, busy week, or temporary weekly budget. The current model has a delayed start and one job transition, but cannot express several real schedule changes. Export exceptions with the plan and derive all forecasts from the same schedule.
- **Fill the remaining gap.** Let users shortlist known-runtime search results and preview their combined coverage before adding them. Existing candidate previews provide much of the calculation foundation. Start with user-selected titles; no recommendation service or account is required.

I would keep the current visual direction and static architecture. The existing performance work already avoids repeated hidden-row rendering, so another broad rewrite is lower priority than these specific correctness and usability gaps.

## Verification

| Check | Result |
| --- | --- |
| Core calculations and portable-state tests | 51 passed |
| Playlist-reader parser tests | 2 passed |
| Workspace browser suite | Passed static HTTP and direct file |
| Quick-settings browser suite | Passed static HTTP and direct file |
| Coverage browser suite with actual date | Failed on date-dependent expectation at line 41 |
| Coverage browser suite with fixed September 22 date | Passed static HTTP and direct file |
| Focused audit reproductions | All five cases reproduced on both protocols |

The focused audit cases covered stale-tab saves, hidden placeholder feedback, duplicate additions, future TV availability, and replacement of a rejected save. They used isolated Chromium contexts and controlled provider data. Temporary reproduction script and raw observations are at `/tmp/gta-queue-improvement-audit/audit.cjs` and `/tmp/gta-queue-improvement-audit/results.jsonl`. Playwright was installed only under that temporary directory, with no repository dependency or build step added.

This was a source and behavioral review. I did not run the full browser suite, audit the current visual layout, or verify live third-party services. Existing working changes were preserved.
