# Release Queue

Release Queue estimates whether a queue of games, shows, movies, books, podcasts, and YouTube playlists will last until your chosen game releases. GTA VI remains the initial target, with the existing November 19, 2026 planning date. The schedule accounts for a delayed start, sleep, a weekly pace, YouTube time, and a job that can begin partway through the queue.

The timeline also shows the item you are projected to be on at the start of launch day, the time left in that item, and how many items follow it. It uses the same schedule as the finish estimate.

TV forecasts retain known episode airdates and wait in playback order. Hatched timeline gaps show the time spent waiting for an episode, even when other items remain at launch. Move an available item earlier to fill a gap. Airdates use calendar days, not exact broadcast times. Existing saves and episodes without dates are treated as available. Saved airdates survive reload, Undo, export, and import; temporary scenarios use those same dates.

The verdict shows how many entertainment hours are still needed to fill the wait, alongside the calendar gap. If the queue covers the wait, it reports how many queue hours remain at launch. Unknown runtimes make the result provisional. Recurring YouTube is deducted from the pace throughout the timeline, so each item ends on its actual projected date.

Search results with known runtimes preview how adding them changes coverage. Manual entries show the effect of the entered hours before Add. **Add item** stays available at the top of the queue while scrolling and takes you directly to the add field. Queue rows identify runtime sources, estimates, and personal corrections.

Open **The plan**, then **Try a different pace or release date**, to compare a temporary weekly budget and target date. The shorter/current/longer runtime comparison applies the selected variation to estimates and corrections while keeping saved video runtimes fixed. It is a scenario comparison, not a probability forecast. Ongoing podcasts project to the preview date; the saved TV episode list stays fixed. Preview inputs do not change the real countdown, exported state, or local saves. **Use this pace** applies only the weekly budget and supports Undo. **Reset preview** returns to the current plan.

Open `index.html` directly or serve the directory with:

```sh
python3 -m http.server 8000
```

The page saves its state in local storage. Open **Settings** and click **Export queue** to download `release-queue.md`, with the queue order, remaining hours, progress, completed items, and schedule settings. Use **Load file** to restore an exported Markdown file or a ZIP containing exactly one `.md` or `.markdown` backup, including inside a folder. ZIPs are extracted locally using the bundled MIT-licensed fflate 0.8.3 library; no upload is required. Both the archive and extracted backup must be at most 10 MiB. Archives with multiple Markdown files or invalid backups are rejected before changing the queue. The importer validates the entire file before changing the current queue. Portable backups support files up to 10 MiB; larger exports are refused, and imports use the same limit.

## Published site

The public site is [artie-mortus.github.io/release-queue](https://artie-mortus.github.io/release-queue/). Anyone with the link can open it. Each visitor's queue stays in their own browser.

To move an existing local queue online, use **Settings → Export queue** in the local copy, then **Settings → Load file** on the published site. Browser storage does not transfer between URLs automatically.

Every push to `main` in [artie-mortus/release-queue](https://github.com/artie-mortus/release-queue) runs `.github/workflows/deploy.yml`. The workflow runs the core and playlist-reader regression suites, copies the current page, core JavaScript, and assets into `_site/`, then deploys that directory through GitHub Pages. A failed check keeps the previous site live. The Actions tab also supports manual deployment. This uses GitHub's built-in token; no hosting secret is required.

After making changes, commit them and run `git push origin main`. Track the deployment in the repository's Actions tab. `node scripts/prepare-site.mjs` prepares the same static files locally. This packaging is only for publishing; opening `index.html` directly still requires no build step.

The original [Sites deployment](https://release-queue.artemis-m.chatgpt.site) remains available as an earlier snapshot. Its identity is retained in `.openai/hosting.json`; GitHub pushes update the GitHub Pages address.

## Existing saves and the renamed folder

The T3 project is Release Queue and its folder is `release-queue`. The former `gta6-time-bridge` path remains a filesystem alias to the same folder. Keep using your existing bookmark or file URL until you have exported a backup. Browsers can isolate local storage by file URL or hosting origin, so a different URL may need **Load file** even though the files are identical. Changing hosts or ports has the same limitation.

The historical `gta-queue.v1` autosave key, its `.undo` history, the `timebridge.v1` fallback, and the ambient-light preference key remain unchanged on purpose. No saves are deleted or reset by the rename. Existing GTA Queue and Time Bridge exports still load. New exports use `release-queue.md` and retain the stable format markers. Changing the target preserves the same queue and completed history; export first if you want a separate archive for each game.

## Workspace

The app has four views. Use the sidebar on desktop or the bottom navigation on a phone.

Desktop is the primary layout. The countdown and summary leave room for the next-item action and queue below. An empty queue shows first-add choices; filters and the remaining-hours heading appear once an item is added. The chevron beside **Your queue** collapses or expands it.

Edit **Weekly time budget** and **YouTube time** directly in the summary above your queue. YouTube accepts hours per day or per week; switching units converts the existing amount. Changes update the forecast and save automatically. The budget includes YouTube, and the summary shows the hours left for your queue. **More time settings** opens The plan for start dates, sleep and job adjustments. The detailed controls and quick editors stay in sync after reload, import and Undo.

- **Your queue** shows release coverage, the next item's progress action, and the full playback order. Filter by media or search your saved titles. Filters do not change playback order. Clear filters to drag items or reorder them with the grip's arrow keys. **Move to next** moves an item to the front and supports Undo.
- **The plan** holds the timeline, weekly time budget, temporary scenarios, and each item's projected finish date. The timeline is built only while this view is open.
- **Completed** keeps finished items and restores their previous progress.
- **Settings** holds the release target, reading pace, exports, imports, recommendation prompt, and ambient-light preference. Save and import failures appear above the workspace, including on mobile.

**Add item** stays in the top bar. It opens a keyboard-accessible dialog for title search, manual estimates, story links, and playlists. Successful additions close the dialog and support Undo. Escape closes it without clearing a draft. Existing saves and portable Markdown files use the same format as before.

Search results identify titles already in the queue or previously completed. A matching active item opens a duplicate warning with **View existing item**, **Add another copy**, and **Cancel**. Matches use saved catalog identity, playlist IDs, story URLs, or media type and normalized title when source identity is unavailable. Cancel preserves the draft; adding another copy counts its runtime separately and supports Undo. Completed history gives a reminder without blocking a replay.

When a lookup has no known runtime, the visible success message names the placeholder and offers **Edit estimate**. This opens the item's estimate field. The row and coverage forecast remain marked provisional until an estimate is entered.

Press **N** to add, **/** to find a queue item, or **Ctrl/Cmd K** for commands. **Ctrl/Cmd Z** undoes a queue change when focus is outside an editable field. The command menu also exposes exports and imports. A notification can be dismissed without losing Undo history.

Shortcut hints use Ctrl on Windows/Linux and the Command symbol on Apple devices. Searching an empty queue focuses **Add item**. **Copy recommendation prompt** beside the queue copies the prompt directly, without visiting Settings; if clipboard access is blocked, it opens Settings where the manual-copy field stays selected and visible.

Views and queue filters are reflected in the URL hash, so reload and browser navigation preserve the view. The app remains plain HTML, CSS, and JavaScript with native dialogs and local fonts. No framework, server, account, build, or package install is required.

## Selecting a game

Open **Settings**, then **Select game**. Search for any game, choose a result, then click **Use game** after reviewing the release date. The target heading, browser title, countdown, verdict, timeline, recommendation prompt, and export all use that game. The app name stays Release Queue. Your queue, progress, and schedule stay in place. **Restore initial target** restores the default target.

Game search uses the public [Wikibase API](https://www.mediawiki.org/wiki/Wikibase/API) with browser-compatible cross-origin requests. Release dates come from Wikidata's publication-date claims. Deprecated dates are ignored; preferred claims take precedence. Only exact Gregorian calendar days are used. When several dates are listed, the earliest is selected and the other dates are available in a selector. Dates can differ by platform or region, so review the source link and edit the date if needed.

If a game has no exact release day, or search is unavailable, enter its title and a planning date by hand. A year or month alone does not become an invented release day. The picker works with direct-file use and static hosting, without an API key or build step. It uses native HTML forms and disclosures with the existing site styles.

The selected game is saved with your queue in the existing browser storage and in exported Markdown. Loading a new export restores its game and date too. Older exports without a saved target keep the currently selected game. Undo can restore the previous target after a change. Queue items called games remain separate from the countdown target.

`DEFAULT_SITE_CONFIG` near the top of `index.html` holds the default GTA VI target and existing storage keys. Normal game selection requires no HTML edits. Exports retain the stable `queue-save:v1` marker and add a validated `queue-target:v1` marker for the game and date. Invalid target metadata rejects the entire import before changing the current plan.

## Daily use

The active queue and its progress controls appear before the add forms. Click **Your queue** to collapse or expand the queue panel. It starts expanded; **Add item** stays available and opens the add dialog, reopening a collapsed queue. Reading pace is in Settings. Story and playlist forms live in the Add item dialog.

- Finished items move into Completed, with their completion date and last active progress. Restore returns them to the queue at that progress.
- Undo restores the queue and settings before a removal, completion, import, supported progress/estimate edit, changed playlist refresh, or applied preview pace. Up to 20 snapshots are saved in this browser, including across reloads. History has a size limit, so large queues retain fewer snapshots. If storage fills up, older Undo history is discarded before retrying the current save. Undo restores the whole snapshot, so it also rolls back changes made afterward. Export includes completed history but not the browser's Undo stack.
- Editing remaining hours preserves reading progress, watched episodes, and playlist durations. The correction scales subsequent remaining-time estimates. Use calculated estimate removes the correction. A corrected book retains the reading pace used for its correction until reset.
- Titles with unknown runtimes retain an Estimate needed label. The summary reports the placeholder hours included in the forecast. Entering a runtime clears the label.

New queues use **My available hours per week**. Enter time available after work, sleep, and other commitments. Recurring YouTube is deducted from this amount. **Adjust for sleep and a job** keeps the original model: job hours proportionally reduce the weekly pace relative to waking hours, then YouTube is deducted. Existing saves retain that original mode. A schedule with no time left displays No time available with guidance on which settings to change.

All of this runs in the browser from `index.html`, with the adjacent `time-bridge-core.js`. The core handles schedule/media calculations and portable Markdown encoding/validation; the page reads form values and coordinates queue actions. No backend, account, database, package install, or build step is required.

The app starts without waiting for Google Fonts. While the page is hidden, countdown updates and background playlist checks pause, and pending edits are saved. Returning to the page updates the forecast and resumes checks.

The graphite palette uses plum and violet panels, peach YouTube controls, lavender accents, locally bundled Inter, and subtle ambient light at the page edges. Media icons have distinct colors alongside their titles and labels. **Pause background** in Settings freezes the light and remembers the choice in this browser. Reduced-motion settings keep the lights steady, and hidden tabs pause their animation. The effect uses embedded CSS and works with direct-file use.

## Media search

Search combines a local game-runtime table with TVMaze, Apple Podcasts, Wikidata, Wikipedia, Open Library, AniList, and optional RAWG results. Ranking normalizes punctuation and accents, recognizes aliases and acronyms, tolerates small spelling mistakes, rejects weak matches, and keeps each provider's relevance order as a tie-breaker.

Successful lookup responses are cached in the current tab for 15 minutes, with up to 100 entries. Each provider has its own request pacing, so a slow or rate-limited source does not hold up other results. Typing a new query cancels the previous search, including its podcast lookup frame.

Runtime quality varies by source:

- Local game entries use approximate main-story times.
- TVMaze totals episodes available by the configured release date and estimates isolated missing runtimes from the show's average.
- Podcast totals exclude future-dated feed entries, remove obvious promos, and project active shows through release day.
- Wikidata supplies movie runtimes but only identifies games and notable web fiction without known playtimes. Wikipedia fills some web-serial discovery gaps, such as ambiguous titles.
- Open Library results include author, year, page count, and cover art when available. Search follows Open Library's relevance order so series searches still find books whose title omits the series name.
- AniList adds light novels with English, romanized, native, and synonym matching plus cover art. When a volume total is known, the app estimates 250 pages per volume and labels that assumption in both search and the queue.
- Book time starts at a personal pace of about 190 pages per hour and rounds to the nearest half hour. That puts the 384-page *Lightning Thief* at about 2 hours. Change the book-pace control to recalculate estimated books; custom estimates keep their calibrated pace and continue to decrease as progress is recorded. The setting, page count, and estimate survive save, export, and import.
- Book queue rows accept reading progress. Published books and page-based web novels use pages read. Royal Road entries require a total chapter count and use chapters read. Other manually added web novels can opt into chapter progress. Because chapter lengths vary, chapter progress estimates the remaining time from the average chapter length. Progress survives save, export, and import.
- Paste a web novel URL to fill in its title, chapter total, and word count. The browser sends the public story URL to Jina Reader when the story site cannot be read directly; no account or API key is needed. Exact word totals are used when a site reports them. Royal Road reports pages instead, so its word count is labeled as an estimate using the visible 275-words-per-page conversion. Some sites hide their metadata, so every field remains editable. The saved queue records the platform and the date that length was measured.

Every runtime remains editable in the queue.

To add a fic, open **Add item**, then **Add fanfiction or a web novel**. Paste an AO3 or FanFiction.net URL. AO3 work and chapter links and FanFiction.net desktop and mobile links keep their source label and clickable URL. AO3 chapter totals use the published count, so `3/10` means 3 available chapters. Fic lookups request full HTML from Jina Reader because its default article extraction can omit the story's title and stats section. The app parses that HTML without displaying it. A direct request has a five-second timeout; the fallback has its own twenty seconds. If lookup is blocked or requires sign-in, enter the title, current word count, and optional published chapter count by hand. Reading progress, including short fics, survives reload and export/import.

YouTube playlists can be added by URL as finite queue items. When served over HTTP, the page uses YouTube's IFrame Player API to read each playable video's duration without an API key. When `index.html` is opened directly, the browser cannot identify the local page to YouTube, so the page sends that public playlist URL to [Jina Reader](https://jina.ai/reader/) to read the current playlist page without cached content. It accepts the page only when every playable video has an indexed runtime. When YouTube explicitly reports hidden unavailable videos, those entries are excluded from the expected count and the refresh status discloses them. Large, incomplete, or inaccessible pages fall back to the CORS-enabled [YouTube Playlist Length](https://youtubeplaylistlength.org/privacy/) calculation service. A fallback with fewer videos than the saved playlist is rejected to prevent an older result from shrinking the queue. The UI discloses those direct-file requests. Public and unlisted playlists work; unexplained missing runtimes stop the lookup instead of silently producing a low total. This is separate from the recurring YouTube hours in the schedule.

Leave the playlist name blank to fetch its title directly from YouTube when adding it, or enter a custom name. Title lookup uses YouTube's public oEmbed endpoint in both direct-file and hosted modes. If YouTube cannot return the title, the form keeps the URL and asks for a name so you can retry manually.

Playlist queue rows keep the individual video durations. Entering a watched count subtracts those videos' actual combined runtime; lowering the count restores them. Arrow steps update the hours and forecast in place, keeping focus without replaying row fades or flashing the totals. These edits use saved durations and need no network request. The watched position survives autosave, export, and import. Older saved playlists can load their video list from the queue row before tracking progress.

Saved playlists reuse their durations for six hours after a successful check, including across reloads and export/import. While the page is visible, it checks once a minute for playlists due to refresh. Older saves without a check timestamp refresh on opening. **Refresh playlist** beside the watched count checks immediately, bypassing the six-hour cache and failed-check retry delay. Each row displays the resulting count or lookup error. When both reads provide video IDs, refresh preserves watched entries across insertions and reordering, including repeated occurrences of the same video. Continue next opens and marks the first unwatched entry. This progress survives reload and export/import. Editing the watched count explicitly marks the first N entries in the current order as watched.

Sources without IDs retain positional progress and disclose that limitation. A refresh without IDs cannot replace a playlist with noncontiguous watched progress; the saved playlist is kept instead. If removal leaves only watched entries, the playlist moves into Completed with its last active progress available for Restore or Undo. Custom runtime corrections survive refreshes. Failed checks leave saved data unchanged and wait 15 minutes before automatically retrying in that tab.

The source audit and platform tradeoffs are documented in [`docs/book-search-sources.md`](docs/book-search-sources.md).

## Tests

Backups live in Settings; the timeline and time-budget editor live in The plan. The weekly budget accepts either a number or the slider. The timeline builds its segments only when expanded. Paste a supported playlist or story URL into the main add field to open its form. Continue next provides progress actions and links to the next video when its ID is available; older saves can refresh to obtain IDs. Playlist check timestamps remain visible after reload.

**Copy recommendation prompt** in Settings, beside **Export queue**, copies a recommendation request with your queue in playback order, remaining hours for each item, and the hours still needed before the selected release date. Paste it into a chat to ask what to play, watch or read next. Recurring YouTube time is accounted for separately. If clipboard access is blocked, a selected text field lets you copy the prompt manually.

Run the dependency-free regression suite with:

```sh
node tests/time-bridge-core.test.js
node tests/playlist-reader.test.cjs
```

The suite covers schedule boundaries, combined stalls, delayed starts, media matching, and safe state-file parsing.

Optional browser regression checks use Playwright and an installed Chromium. These are development tools only; the site does not depend on them:

```sh
npm install --prefix /tmp/release-queue-check playwright
NODE_PATH=/tmp/release-queue-check/node_modules node tests/static-browser.test.cjs
NODE_PATH=/tmp/release-queue-check/node_modules node tests/static-optimization.test.cjs
NODE_PATH=/tmp/release-queue-check/node_modules node tests/playlist-progress.test.cjs
NODE_PATH=/tmp/release-queue-check/node_modules node tests/playlist-refresh.test.cjs
NODE_PATH=/tmp/release-queue-check/node_modules node tests/fanfiction.test.cjs
NODE_PATH=/tmp/release-queue-check/node_modules node tests/add-flow.test.cjs
NODE_PATH=/tmp/release-queue-check/node_modules node tests/queue-actions.test.cjs
NODE_PATH=/tmp/release-queue-check/node_modules node tests/compact-layout.test.cjs
NODE_PATH=/tmp/release-queue-check/node_modules node tests/workspace.test.cjs
NODE_PATH=/tmp/release-queue-check/node_modules node tests/portable-save.test.cjs
NODE_PATH=/tmp/release-queue-check/node_modules node tests/quick-settings.test.cjs
NODE_PATH=/tmp/release-queue-check/node_modules node tests/icons.test.cjs
NODE_PATH=/tmp/release-queue-check/node_modules node tests/coverage.test.cjs
NODE_PATH=/tmp/release-queue-check/node_modules node tests/game-picker.test.cjs
NODE_PATH=/tmp/release-queue-check/node_modules node tests/rename-compatibility.test.cjs
NODE_PATH=/tmp/release-queue-check/node_modules node tests/recommendation-prompt.test.cjs
NODE_PATH=/tmp/release-queue-check/node_modules node tests/availability-additions.test.cjs
NODE_PATH=/tmp/release-queue-check/node_modules node tests/calendar-boundaries.test.cjs
```

Set `CHROMIUM_PATH` if Chromium is somewhere other than `/usr/bin/chromium`. The suites share `tests/browser-fixture.cjs`, which serves the static files, launches Chromium, isolates storage for each protocol, collects page errors, and closes contexts even when checks fail. Suites supply their viewport and controlled network responses. They write screenshots to `/tmp/release-queue-desktop.png` and `/tmp/release-queue-mobile.png`, with failure captures under `test-results/gui/`. External requests are blocked during these tests, so they verify local behavior rather than live provider availability.

The shared browser fixture starts its clock on September 22, 2026 and defaults to the America/Chicago timezone. A suite can supply `clockDate` or change `page.clock` for a deliberate calendar case. The calendar-boundary suite checks the day before launch, launch midnight, the day after launch, and the repeated hour when daylight saving ends. Time advances normally from the pinned starting date so provider pacing and retries still run.

For repeatable render measurements and desktop/mobile evidence:

```sh
xvfb-run -a env NODE_PATH=/tmp/release-queue-check/node_modules node tests/simplification-benchmark.cjs final
```

This uses a fixed clock, offline queues, three warm-up renders and ten samples. It records timings, schedule/forecast/queue rebuild counts, computed styles, and screenshots under `test-results/`. Timings cover synchronous work through DOM writes, excluding layout/paint, debounced storage and live provider latency. It is a development measurement, not a speed threshold. The baseline and refactor decisions are in [`docs/simplification-results.md`](docs/simplification-results.md). Where local display rules require it, run browser suites through `xvfb-run -a` as well.

The optimization checks use controlled responses and sandboxed podcast fixtures to cover delayed font CSS, queue edits and keyboard ordering, storage quotas, playlist freshness, search cancellation, caching, and provider pacing. The original measurements and implementation notes are in [`docs/static-optimization-audit.md`](docs/static-optimization-audit.md).

For extreme queue sizes, dated-episode forecasts, portable-state limits, and isolated optimization experiments:

```sh
xvfb-run -a env NODE_PATH=/tmp/release-queue-check/node_modules node tests/extremes-benchmark.cjs
```

This records local HTTP and direct-file measurements in `test-results/extremes-benchmark.json`. It also compares an experimental append-summary calculation with 2,520 full forecasts. The product proposals, measured bottlenecks, and experiment limits are in [`docs/extremes.md`](docs/extremes.md). The benchmark does not change the application runtime.
