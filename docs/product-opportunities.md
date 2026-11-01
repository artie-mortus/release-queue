# Release Queue improvement review

Reviewed 2026-10-05. The owner subsequently authorized improvements 2–6 from the final recommendation: concrete gaps, candidate previews, trustworthy forecasts, pace/date scenarios, and reliable progress/saves. These are implemented; verification is recorded in `docs/coverage-improvements.md`. Other ideas below remain proposals. The owner explicitly rejected the Neon Road idea.

The owner clarified the purpose after the initial review: the user is waiting for a game and wants to know whether their queue will occupy the entire wait. The central question is “Will this queue last until release?”

Organize the experience around coverage of that wait. Keep the countdown, ordered queue, and neon identity. Make the route from today to release immediately visible, including any uncovered gap or items remaining at launch. The earlier Tonight-first recommendation and alternate completion goal are withdrawn.

## What I inspected

- The current working copy, including `index.html`, `time-bridge-core.js`, README, the previous overhaul checklist, design notes, and representative tests.
- Empty and populated desktop views at 1280 × 800, and a populated mobile view at 390 × 844, using the collaborative browser and a temporary static server.
- A four-item synthetic queue. These were audit fixtures, not the owner's saved queue.
- The dependency-free test files. All 44 core tests and both playlist-reader tests passed. Some core checks inspect source text; this is not equivalent to full runtime coverage.

I did not run the full browser regression suite, verify live lookup providers, measure long-queue performance, or conduct user testing. The ideas below are design judgments and engineering recommendations, not measured retention improvements.

## Fix the trust problems first

### The timeline and forecast tell different stories about recurring YouTube

At 21 available hours per week and one hour of YouTube per day, 14 hours remain for queue items. A 50-hour game takes 25 days. The existing timeline draws that game's segment using the full weekly pace, ending at about 16.7 days, and appends YouTube afterward.

The application explains this accounting convention, but putting it on a calendar makes the game's endpoint misleading. The overall finish calculation can still be correct while the intermediate segments suggest the wrong dates.

Evidence: `index.html` in `renderBridge`, near lines 996–1020, calls `dayForHourFull` for item segments. `render` and the launch-day calculation use the reduced schedule. The browser reproduced 16.7 versus 25 days.

Use actual scheduled start and finish dates for each item. Show recurring YouTube as a separate budget deduction or parallel band. Derive the timeline, forecast, and launch-day position from one forecast result.

### Playlist progress needs identity as well as position

The current refresh reconciles durations and retains a watched count. It also replaces available video IDs. Inserting a new video near the start or reordering a playlist can change what that count refers to.

Evidence: `refreshedPlaylist` in `time-bridge-core.js`, near line 185, and `refreshYoutubePlaylists` in `index.html`, near line 3292. This is a source-based risk; I did not reproduce it against a live playlist.

Track completed entries by identity where the source provides IDs. Account for duplicate videos as distinct occurrences. When a provider supplies only durations, preserve the positional model and explain that limitation. Do not silently claim identity-safe reconciliation.

### Rough estimates deserve rough forecasts

The app labels unknown runtimes and retains manual corrections, which is worth preserving. Extend that honesty to the forecast. Offer user-editable low, expected, and high estimates where useful, and show a plausible finish window. These are scenarios, not statistically calibrated probabilities.

Keep exact runtimes exact. Separate source metadata, personal progress, and overrides so refreshing a provider cannot erase a correction. A changed forecast should have an explanation such as “Three episodes were added” or “Your weekly budget decreased.”

## Make coverage of the wait the main experience

### Put the route and verdict first

The first screen should answer “Does my queue get me all the way to release?” Show an always-visible route from today to the target date, with queue items occupying their projected calendar spans.

- If the queue runs out early, make the uncovered stretch visible and state both the calendar gap and the additional entertainment hours needed at the selected pace.
- If it reaches release, say so directly and show which item the user will be on at launch, plus what remains afterward.
- Keep the countdown beside the verdict and route so elapsed waiting time and queue coverage can be read together.
- Keep Add and the weekly pace control nearby. Adding an item or changing pace should visibly change coverage.
- Keep progress controls in the queue so finishing or consuming an item updates the remaining route.

On mobile, use a compact horizontal overview or a vertical route with readable item labels. A long queue should not push Add out of reach. More detailed settings and backups can remain behind disclosures.

### Keep one clear definition of success

Success means having entertainment left throughout the wait. Running past launch is a covered wait; finishing early leaves a gap. Preserve that original meaning instead of adding a competing “finish everything before launch” mode.

Distinguish having enough content from having time to consume it. A zero-hour weekly budget should show “No queue time available,” not imply successful coverage because the queue never finishes. A delayed start should be visible as its own interval.

### Make filling the gap actionable

For example, with 42 days until release and 14 queue hours available per week, the user has 84 hours to occupy. A 60-hour queue leaves 24 entertainment hours uncovered, equivalent to 12 days at that pace. Label these as illustrative numbers, not the current user's forecast.

Use the schedule's actual capacity to compute the gap when pace varies. Show the effect of a candidate item before adding it, such as how many hours of the gap it fills and whether it carries the queue past launch. Reordering a fixed-duration queue changes the item reached at launch, not its total coverage.

Do not require library management, daily recommendations, or parallel queues to answer the core question. Those features are outside the recommended scope.

### Make adding one coherent interaction

Keep the existing title/URL detection, but present one add panel that reveals only relevant fields. A story link leads to length and reading progress; a playlist leads to lookup status; a manual game leads to an estimate. Preserve a quick manual path when a provider fails.

Explain before committing when a title has only a placeholder runtime. Add duplicate detection and a visible source for estimates. Distinguish “no matches” from “provider unavailable.” Expanding the number of sources is lower priority than making existing results trustworthy.

### Show how pace changes coverage

Keep a single available-hours input as the easy default. Let the user preview how a faster or slower pace moves the queue's endpoint. Label pace changes as assumptions, not instructions to consume more or less entertainment.

Dated budget changes and skipped weeks can improve accuracy later. Preserve the existing owner-calibrated reading speed. Missing progress logs must not be treated as proof that the user did nothing.

## Bigger experiments worth trying

| Experiment | Concrete behavior | Scope and constraint |
| --- | --- | --- |
| Release moves | Preview how a delayed release changes the uncovered gap and how much more queue time is needed. | Use a temporary target date without changing the saved plan until applied. All local. |
| Fill the gap | Preview a combination of candidate titles that supplies the missing entertainment hours. | Use known or clearly labeled estimated runtimes. Let the user choose; no AI service is required. |
| Road to Vice | Rejected by the owner. | Keep the existing readable timeline and neon background; do not build a road or map. |
| Will it still last? | Compare shorter and longer runtime estimates to show whether the queue covers the wait under both assumptions. | Present scenarios, not invented confidence percentages. |
| Launch-night ticket | Export a shareable image of the route or a portable queue pack that a friend can import. | User chooses what to include. Static export requires no account, social feed, or hosted storage. |
| After the countdown | At launch, show a personal recap and let the user choose another destination while preserving their library and history. | The target is already configurable in source. Make it editable in the app and include it in a versioned save. |

The selected direction keeps the current timeline, adds coverage previews and temporary scenarios, and strengthens progress and saves. A road or map is outside the agreed design.

## Visual audit

Assumed mood: the existing playful, compact Vice City direction. The approved neon lights and colors suit the product; changing them is not the main opportunity. Marketing-page narrative and hero-layout gates do not apply to this app shell.

| Severity | Gate or axis | Evidence | Proposed fix |
| --- | --- | --- | --- |
| Major | Hierarchy; gate 41, empty state | In the empty 1280 × 800 view, the add input begins around y=854. Countdown and empty-state chrome precede the first useful action. Markup near `index.html:579` and `index.html:621`. | Put the add action inside the first empty-state panel and keep it persistently reachable. |
| Major | Hierarchy; gate 24, app density | With four items on mobile, Add begins around y=1672, and the timeline is collapsed by default. | Show a compact route and coverage verdict together, keep Add reachable, and move backups into a discoverable utility menu. |
| Major | Gate 44, truthful chart geometry | Calendar segment endpoints use the full pace while the forecast deducts recurring YouTube. `index.html:972`. | Draw actual scheduled dates and show recurring time separately. |
| Minor | Gate 45, understandable input states | The visible add form shows an unlabeled-to-sighted-users number initialized to 10 and uses the media selector for both filtering and manual entry. `index.html:646`. Screen-reader labels do exist. | Show a visible estimate label and make the selected add mode clear. |

Visual audit total: 0 critical, 3 major, 1 minor. This is a focused review, not a claim that all accessibility or contrast checks passed.

## Architecture worth keeping, and what to replace

The static architecture is an advantage. Keep direct-file use, ordinary static hosting, public browser-compatible lookups, portable backups, and the tested scheduling and parsing behavior.

The main maintenance problem is that the 3,514-line HTML file combines rendering, mutable state, serialization, providers, and interactions. A framework migration alone would not resolve those responsibilities.

Extract a few modules with small interfaces:

- **Queue state:** stable item IDs and explicit actions for progress, ordering, completion, and undo. Render from application state rather than reading form fields as the authoritative data model.
- **Forecast:** accept queue, schedule, target, and current time; return item dates, launch position, totals, and explanations. This makes alternate plans and deterministic testing straightforward.
- **Catalog:** hide provider-specific fetching, cancellation, caching, runtime provenance, and errors behind shared search and resolve operations. Existing providers are the concrete adapters.
- **Persistence:** own schema versions, migrations, validation, backup export, and recovery. Keep legacy Markdown readable even if structured data becomes the internal save format.
- **Views:** render coverage, route, queue, and settings from the same state, preserving focused inputs and updating only affected rows.

Use adjacent classic scripts with explicit namespaces or closures, as the current core already does. Browser ES modules introduce CORS restrictions for `file://` loading, so they are not a drop-in extraction under the repository rules. [MDN JavaScript modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules).

Portable export remains a first-class capability because browser behavior for local storage under `file:` URLs is not standardized. Keep storage failures visible and saves recoverable. [MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).

Backloggd already provides collection tracking, journals, and lists. Release Queue's stated purpose gives it a more specific focus: whether a personal queue covers the wait for a game. There is no need to expand into a general review network. [Backloggd about](https://backloggd.com/about/).

## Recommended sequence

1. Fix timeline truthfulness, examine playlist identity changes, and pin save/restore compatibility with behavioral checks.
2. Prototype an always-visible route, coverage verdict, and reachable Add action using the existing model. Check empty, insufficient, sufficient, and stalled queues on desktop and mobile.
3. Show uncovered entertainment hours and preview how candidate items change the gap. Extract queue state and forecast modules where needed, retaining tested behavior.
4. Add temporary pace and release-date scenarios, followed by dated schedule exceptions if needed.
5. Develop the neon route treatment, shareable tickets, and post-launch recap after the coverage display is clear and accurate.

Acceptance criteria should describe behavior: the first screen answers whether the queue lasts until release; any shortfall is shown in both calendar time and entertainment hours; adding an item visibly changes coverage; forecast and timeline dates agree; metadata refresh preserves personal progress; old saves restore correctly in both direct-file and hosted modes.

A complete UI rewrite is reasonable. Replacing the calculation, save compatibility, and provider work wholesale would discard useful behavior without proving a better product.
