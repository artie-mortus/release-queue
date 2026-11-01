# Static optimization audit

Audited 2026-09-22, then implemented the first optimization pass with user approval. Direct-file use, ordinary static hosting, browser storage, and Markdown export/import remain supported. The baseline findings and line numbers below refer to the files before this optimization pass.

## Implemented

- Font CSS loads without blocking initialization. The existing fonts and fallback stack remain in place; four unused startup preconnects were removed.
- Undo keeps at most 20 snapshots within 500,000 serialized UTF-16 code units, approximately 1 MB before storage overhead. Large queues retain fewer snapshots. Quota recovery releases old persisted history before retrying the current save, then trims older snapshots until history fits. The UI reports current-save and history-save failures separately. Oversized individual snapshots are omitted from Undo; export still retains the current queue.
- Add, progress, remove, complete, restore, import, and reorder actions use a single queue-render path. Estimate edits update existing rows, preserving the input and subsequent action clicks. Repeated division edits use the latest remaining hours. Number animations share one layout read, and Completed rows render only when opened or their visible content changes.
- Playlist check timestamps survive autosave and portable files. Fresh durations are reused for six hours, including after reopening. Visible tabs poll for due checks once a minute; failures retain saved data and wait 15 minutes before another attempt in that tab. Legacy saves without a timestamp still work. Incremental video-ID reconciliation remains deferred; a due refresh still reads the complete playlist.
- Successful JSON and podcast lookups share a 100-entry cache with a 15-minute expiry. Providers have independent start pacing, with one second between Open Library starts, 2.1 seconds for AniList, 3.1 seconds for Apple, and 250 ms for the others. Fetch providers honor exposed retry headers after a 429, using a one-minute cooldown when unavailable. Podcast JSONP cannot expose HTTP response headers, so it uses pacing and timeout/error handling. Aborted requests and error responses are not cached. Search controllers are passed explicitly, podcast frames are removed on cancellation, and fast results still render while other providers are pending.
- Hidden pages pause countdown, render, and playlist polling timers. Hiding flushes pending saves, and returning recalculates the current forecast before restarting timers.

All runtime changes stay in `index.html` and the existing `time-bridge-core.js`. No deployment or required build step was added. The optional optimization regression suite is `tests/static-optimization.test.cjs`, alongside the existing core and browser tests. It runs under static HTTP and `file://` with isolated storage and controlled provider responses.

## Follow-up verification

All 37 core tests pass. Both the existing browser suite and the new optimization suite pass under static HTTP and direct-file loading. The new checks exercise a withheld font stylesheet, one rebuild per addition, keyboard reordering and focus, estimate editing followed by removal and Undo, repeated division edits, storage quota recovery, history-save errors, hidden-page saving and timers, playlist freshness across reloads, legacy playlist refresh and failure backoff, cache expiry and eviction, request spacing, retry headers, JSONP frame cleanup, stale-result rejection, and partial results. Provider responses are fixtures; these checks do not measure live API availability.

Reusing the original profiling scripts and fixtures produced these results:

| Check | Before | After |
| --- | --- | --- |
| Initialization with an injected 1,500 ms font-CSS delay, HTTP | 1,556 ms | 59 ms |
| Same startup check, direct file | 1,555 ms | 59 ms |
| Queue rebuilds for one addition, every fixture and both protocols | 2 | 1 |
| Serialized Undo history, 10 shows with 500 episodes each | 6,848,071 characters | 342,405 characters |
| Persisting that fixture, both protocols | Undo quota error | Current queue and bounded history saved |

Initialization measures the script's `is-revealed` marker, not visible paint or Google's actual latency. The retained episode-heavy history contains one recent snapshot because the size budget takes precedence over the 20-entry ceiling. Small queues still retain up to 20.

HTTP queue-rebuild medians were 1.3, 5.4, and 23.5 ms for 25, 100, and 500 simple items after the change. Single addition samples were 14, 36, and 150 ms, compared with 18, 47, and 196 ms before. These samples are diagnostic; the stronger result is the removed duplicate rebuild. Large lists still pay for full structural rendering, so this pass does not claim to solve every large-queue interaction cost.

The application now totals 196,895 bytes, or 56,574 bytes with the same default gzip calculation. The extra cache, persistence, and scheduling code adds about 1.8 KB compressed. The baseline JSON results were preserved as `/tmp/gta-static-audit-before.json` and `/tmp/gta-static-startup-before.json`; the original result filenames contain the follow-up run.

## Baseline recommendations

| Order | Change | Evidence and scope |
| --- | --- | --- |
| 1 | Let the app start before the font stylesheet arrives. | The stylesheet at `index.html:14` blocks the scripts that initialize and reveal the UI. A simulated 1.5-second CSS delay delayed initialization by about 1.5 seconds on both protocols. Load the font-only CSS without blocking startup, keep the existing fallback fonts, and check layout shifts. Small change. |
| 2 | Bound Undo by serialized size as well as its 20-entry limit. | `checkpoint()` at `index.html:1415` copies the full Markdown state, including episode lists. A valid 342 KB queue produced 6.85 MB of Undo data and a quota error. Evict oldest history entries when the budget is exceeded, retry quota failures with less history, and report queue-save and history-save outcomes separately. Moderate change. |
| 3 | Render each mutation once and update the affected rows. | `addToQueue()` at `index.html:1738` calls `renderQueue()`, then `render()` calls it again. Instrumentation confirmed two rebuilds per addition. Several progress, completion, removal, and import handlers use the same pattern. Give one function responsibility for committing a change and rendering; preserve input focus and keyboard reordering. Start by eliminating duplicate rebuilds, then add stable item identities and delegated events if larger queues still need work. Moderate change. |
| 4 | Persist playlist freshness and avoid rereading unchanged video durations. | `index.html:2998` schedules a refresh on every open, while the six-hour interval only lasts for that tab session. `readYoutubePlaylistDurations()` at `index.html:2773` cues every video again. Persist the last successful check, reuse saved totals until due, and defer background checks until the page is visible. A later change can retain video IDs alongside durations and fetch only new IDs when an unchanged prefix is verified. Old saves and reordered/deleted videos need a full reconciliation path. Moderate change for freshness; larger for incremental lookup. |
| 5 | Reduce redundant search traffic and honor provider limits. | An uncached all-kind search at `index.html:2508` starts six external providers with the shipped empty RAWG key. The 250 ms debounce is not a rate limiter. Keep partial results and kind filtering; add provider-specific pacing, bounded expiring caches, and cancellation for the podcast iframe. Apple search and Wikidata search currently have no query cache. Moderate change. |

For rendering, also replace the three separate `offsetWidth` reads in the number-flash loop at `index.html:1229` with a batched animation restart. These reads force pending layout during changes. `renderQueue()` replaces the entire list and reattaches handlers, including rebuilding Completed while it is collapsed. Render Completed only when its data changes or it is first opened. Preserve the existing caret and focus behavior when consolidating handlers.

## Local measurements

Chromium 153.0.8010.52, headless, desktop viewport 1280 by 900, no CPU throttling. Each protocol used a fresh isolated profile. External requests were blocked. Fixture names and episode metadata were synthetic, and every measured export passed `parseStateText()`.

The timing columns below are medians of 11 synchronous function calls after one warm-up call. An unchanged render kept the existing state signature; a changed render explicitly invalidated it. These timings include work forced by the functions but exclude deferred paint, network time, and most later layout. They are local diagnostics, not Lighthouse, INP, or mobile performance scores.

| Fixture over static HTTP | DOM elements | Unchanged `render()` | `renderQueue()` | Changed `render()` |
| --- | ---: | ---: | ---: | ---: |
| 25 mixed game, book, and movie items | 961 | 0.4 ms | 1.5 ms | 2.1 ms |
| 100 mixed items | 2,808 | 0.4 ms | 5.6 ms | 6.3 ms |
| 500 mixed items | 12,678 | 0.7 ms | 27.9 ms | 27.0 ms |
| 10 shows with 500 episodes each | 1,094 | 0.7 ms | 2.1 ms | 5.6 ms |

Direct-file queue rebuild medians were 1.4, 5.7, 28.5, and 2.5 ms for the same fixtures. Adding one item caused two queue rebuilds in every fixture on both protocols. Single addition samples took 18, 47, and 196 ms for the 25-, 100-, and 500-item HTTP queues. Those single samples illustrate additional interaction work, including forced layout, and are not stable latency estimates or measured optimization gains.

The episode-heavy fixture serialized to 342,324 ASCII characters. Twenty full Undo snapshots serialized to 6,848,071 characters. Writing the current queue succeeded, then writing `.undo` raised `QuotaExceededError` under both protocols. This reproduces a history-save failure, not a loss of the current queue in that experiment. The current shared catch reports the two writes as one failure. Validating all 20 saved snapshots also took about 18 ms locally; bounded history reduces restore work as well as storage use.

A separate startup experiment returned empty font CSS immediately or after an injected 1,500 ms delay, with all other external requests blocked. The `is-revealed` initialization marker moved from 71 to 1,556 ms over HTTP and from 60 to 1,555 ms for direct-file use. This proves the startup dependency; it does not measure Google's real response times or first visible paint.

The two shipped application files total 190,623 bytes. Compressing them separately with Node's default gzip produced 54,796 bytes; Brotli produced 46,995 bytes. These are calculated payload sizes, excluding fonts and API responses. They do not establish compression settings on any deployed host. Ordinary static hosting can serve compressed responses and cache static assets without an application backend. Use host-managed compression where available, and ensure cache policies allow updates to unversioned files. [HTTP compression](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Compression), [HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching).

Reproduction scripts and raw results from this session are in `/tmp/gta-static-audit.cjs`, `/tmp/gta-static-audit-results.json`, `/tmp/gta-static-startup-audit.cjs`, and `/tmp/gta-static-startup-audit-results.json`. They use the already-installed Playwright at `/tmp/gta-queue-check/node_modules/playwright` and Chromium at `/usr/bin/chromium`. These are temporary investigation tools, not site dependencies.

Baseline verification passed all 37 core tests and the existing browser regression suite under both HTTP and `file://`. That suite blocks external requests, so live search-provider availability was not tested. The commands were `node tests/time-bridge-core.test.js` and `NODE_PATH=/tmp/gta-queue-check/node_modules node tests/static-browser.test.cjs`.

## Changes to defer

The unchanged 30-second render took less than 1 ms in these fixtures, although it still made 37 DOM mutations. A countdown call made eight mutations. Pause those updates while hidden and avoid writing unchanged text, but prioritize startup, interaction work, and storage capacity first.

Splitting the 111 KB inline application script into ordered classic scripts can improve maintenance and HTTP cache reuse. It will not itself make the calculations faster. Keep the existing pure core and avoid introducing a required bundler, framework, worker, or IndexedDB migration for the measured workloads. Consider list virtualization only if large-queue interactions remain slow after removing duplicate work; it adds focus and drag-and-drop complexity.

## Storage and saving

`localStorage` reads and writes synchronously block JavaScript execution. A delayed save still does its serialization and writes on the main thread when the timer fires. IndexedDB offers asynchronous operations, but changing storage engines is not the first step for this app. [Mozilla's Web Storage documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API#concepts_and_usage), [IndexedDB specification](https://w3c.github.io/IndexedDB/#dom-idbfactory-open).

The current `saveState()` already debounces for 400 ms, and `render()` uses a signature to avoid saving on ordinary unchanged timer ticks. Preserve those protections. Focus first on bounding the serialized undo history and handling quota failures independently from saving the current queue. If replacing the render signature with a dirty flag or state revision, keep display updates outside that path. `serializeState()` embeds the current date and time, so comparing newly serialized strings would report a difference even if the queue had not changed. These are implementation recommendations based on the current code.

Do not claim universal autosave support from `file://`. Mozilla explicitly documents its `localStorage` behavior as undefined across browsers. The URL standard leaves file origins implementation-dependent; the Storage standard rejects opaque origins, and IndexedDB throws `SecurityError` if it cannot obtain a storage key. Thus IndexedDB is not a guaranteed direct-file replacement either. Keep caught storage failures and portable exports. Test file opening in each supported browser. [File URL storage caveat](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage#description), [URL origin rules](https://url.spec.whatwg.org/#origin), [storage key rules](https://storage.spec.whatwg.org/#obtain-a-storage-key), [IndexedDB open rules](https://w3c.github.io/IndexedDB/#dom-idbfactory-open).

## Scripts and direct-file compatibility

The existing classic script plus `TimeBridgeCore` wrapper is a suitable way to separate code without a build step. Further separation can follow the same pattern. External module scripts require CORS for cross-origin loads, and browser module loading from local files runs into CORS restrictions. Keep required startup code in classic scripts if double-clicking `index.html` must remain supported. An inline module without external imports is a different case; the restriction concerns loading module files. [HTML script rules](https://html.spec.whatwg.org/multipage/scripting.html#attr-script-crossorigin), [Mozilla's module loading caveat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules#other_differences_between_modules_and_classic_scripts).

Splitting files improves maintenance and can allow separate HTTP caching, but it does not by itself reduce code execution. Preserve dependency order when moving the inline boot script. In particular, simply adding `defer` to the core script while leaving its consumer inline changes that order. [HTML script execution rules](https://html.spec.whatwg.org/multipage/scripting.html#attr-script-defer).

## Search cancellation and partial results

Keep the existing 250 ms debounce, selected-kind filtering, per-source result painting, and sequence guard. `Promise.allSettled()` fulfills only when every input settles, so rendering solely after awaiting it would hold fast results behind the slowest source. [ECMAScript `Promise.allSettled()`](https://tc39.es/ecma262/multipage/control-abstraction-objects.html#sec-promise.allsettled).

`AbortController` can cancel fetch requests and response-body consumption. It does not automatically cancel arbitrary promises or synchronous work. A helper must check an already-aborted signal as well as subscribe to future abort events. Pass each search's captured signal through every dependent request instead of reading the mutable global controller when a later request begins. Keep the sequence guard because cancellation and ownership of the visible results are separate concerns. These recommendations follow the current `jget()`, `jpost()`, and source orchestration. [AbortController behavior](https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort), [DOM abort guidance](https://dom.spec.whatwg.org/#aborting-ongoing-activities).

The debounce is not a provider rate limiter. Open Library documents one request per second for unidentified clients and asks clients to cache responses; do not assume this browser app qualifies for its identified-client tier. AniList's rate-limit page currently warns of a temporary 30-request-per-minute limit, below its nominal 90, and also documents a burst limiter. Add per-provider pacing and bounded caches while allowing other sources to return immediately. [Open Library usage and limits](https://openlibrary.org/developers/api#rate-limits), [AniList rate-limit documentation](https://docs.anilist.co/guide/rate-limiting).

Honor `429`, `Retry-After`, and reset headers when the browser exposes them. Cross-origin scripts cannot read arbitrary response headers unless the provider exposes them through CORS, so retain a conservative cooldown when those headers are absent. Do not cache cancellation or transient failures as successful empty results. [AniList retry guidance](https://docs.anilist.co/guide/rate-limiting), [response-header exposure rules](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Expose-Headers). AniList's documentation was available through the search index; direct retrieval returned HTTP 403, so the stated limit is documented guidance rather than a live API capacity measurement.

## Timers and page visibility

Browsers throttle background timers and can freeze hidden pages. Their throttling is not a substitute for explicitly avoiding work that cannot be seen. Chrome recommends persisting unsaved state and stopping unnecessary UI work when the page becomes hidden. [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API#policies_in_place_to_aid_background_page_performance), [Chrome page lifecycle guidance](https://developer.chrome.com/docs/web-platform/page-lifecycle-api#developer-recommendations-for-each-state).

For this app, pause the one-second countdown updates and periodic full render while hidden. Flush a pending dirty save on `visibilitychange` to hidden. On return, recalculate from the current time and render once before restarting timers. Check playlist freshness on return instead of relying solely on the six-hour interval. Hidden can be the last observable lifecycle state, especially on mobile, so do not depend solely on an unload handler. These are application recommendations, not guarantees against browser crashes or forced termination. [Chrome lifecycle guidance](https://developer.chrome.com/docs/web-platform/page-lifecycle-api#developer-recommendations-for-each-state).

## Fonts and connection hints

The page already requests `display=swap`, preconnects to Google Fonts, and uses `crossorigin` for the font-file origin. Google Fonts supports controlling `font-display` through its `display` query parameter. `swap` displays fallback text quickly but can shift layout when the font arrives. `optional` trades the certainty of the custom font appearing for avoiding a late font swap. Keep that tradeoff visible when testing typography changes. [Google Fonts CSS API](https://developers.google.com/fonts/docs/css2#use_font-display), [Google's font guidance](https://web.dev/articles/font-best-practices#choose_an_appropriate_font-display_strategy).

The Google Fonts stylesheet itself still blocks initial rendering. `font-display` controls font rendering after the font-face CSS is available; it does not make the enclosing stylesheet asynchronous. One experiment is to load that font-only stylesheet asynchronously while leaving all essential app styles inline. Google documents a preload-to-stylesheet pattern with a no-JavaScript fallback; a dynamically inserted stylesheet is also nonblocking by default. Verify fallback typography, layout shifts, and both protocols before keeping such a change. [Stylesheet blocking rules](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/link#blocking), [Google's CSS deferral example](https://web.dev/articles/defer-non-critical-css#optimize).

The four other startup preconnects are for cover images, AniList, and YouTube. They serve features used after interaction rather than guaranteed startup requests. Consider removing them or adding them when the relevant control receives focus. Google recommends reserving preconnect for critical origins used soon because unused connections consume resources and may delay other requests. Keep the font preconnects while those fonts remain on the initial render path. Measure the effect; preconnect is a hint, not a guarantee. [Google's preconnect guidance](https://web.dev/articles/preconnect-and-dns-prefetch#how_to_implement_relpreconnect).

Bundled WOFF2 files or system fonts are options for reducing external font dependency. Self-hosting is not automatically faster than a font CDN, and direct-file font loading needs browser testing. Keep the existing system fallback stack. Google recommends comparing transfer time, including connection setup, before deciding whether to self-host. [Google's font delivery guidance](https://web.dev/articles/font-best-practices#use_self-hosted_fonts).

## Optional hosted caching

A service worker remains browser-side code and can cache the static app for repeat visits and offline loading. It must be optional here. Registration requires HTTP or HTTPS script and scope URLs plus a trustworthy origin; deployment normally means HTTPS, while localhost supports development. A `file://` page cannot use it as its required startup path. [Service worker registration rules](https://w3c.github.io/ServiceWorker/#start-register), [Mozilla's setup guidance](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers#setting_up_to_play_with_service_workers).

Consider this only after the shared runtime work is addressed and hosted offline use is a goal. Keep startup independent of successful registration, version the cached app files, and define an update policy. Service workers do not grant permission to read APIs blocked by CORS; their cross-origin responses retain the platform's filtering restrictions. Manual entry and exports must continue to work without network caches. [Service worker cross-origin rules](https://w3c.github.io/ServiceWorker/#cross-origin-resources).
