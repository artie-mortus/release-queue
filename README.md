# Release Queue

Plan what to play, watch, and read before a game releases. Release Queue estimates whether your queue will fill the wait based on your available time and remaining progress.

[Open Release Queue](https://artie-mortus.github.io/release-queue/)

- Track games, TV, movies, books, podcasts, web fiction, and YouTube playlists.
- Choose a target game and release date.
- Look up regional unlock times for Xbox and PC / Microsoft Store preorders. PC / Steam and PlayStation use verified publisher or store schedules where available. The countdown converts the result to your local time and saves its platform, store country, edition, and source with your queue.
- Adjust your weekly time budget and recurring YouTube time.
- See projected finish dates and compare different paces.
- Record progress, keep completed items, and undo changes.

Runtime estimates are editable. Missing runtimes need an estimate, and public lookup services may sometimes be unavailable.

Release-time lookup starts automatically when you choose a game and refreshes saved automatic targets when you reopen the app. Xbox is selected initially. The browser's time zone and language suggest a store country, which you can change to match your account. A store country can span several time zones, so the store's timestamp takes precedence over an assumed local midnight. Lookup failures keep a saved schedule. Unknown unlock times remain labeled as planning estimates, and manual entry is still available. Steam and PlayStation do not allow the tested browser API requests, so automatic coverage there is limited to the bundled, source-linked schedules. Source checks and the current catalog are documented in [release-time-sources.md](docs/release-time-sources.md).

## Run locally

Open `index.html` in your browser, or serve the folder:

```sh
python3 -m http.server 8000
```

Then visit [localhost:8000](http://localhost:8000). The app uses plain HTML, CSS, and JavaScript. No account, backend, package install, or build step is required.

## Save your queue

Your queue saves automatically in your browser. In **Settings**, use **Export queue** to download a Markdown backup and **Load file** to restore it. ZIP files containing one Markdown backup are also supported, up to 10 MiB.

New backups record queue and completed-item counts so incomplete files are rejected before replacing your queue. Older backups remain supported.

Podcast projections use the date of their feed snapshot, so new episodes remain in the estimate as time passes. Older podcast saves receive a snapshot date when first restored.

If a saved queue in your browser can't be read, Release Queue keeps a copy before saving anything new. Download it from **Settings**.

Browser storage is separate for each URL. Export and import your queue when moving between a local copy and the published site, or between browsers.

## Development

`index.html` has the markup and `styles.css` the styles. `time-bridge-core.js` has the calculations and save format, `lookups.js` the public catalogs and lookup services, and `app.js` the interface code. The scripts load as plain classic scripts in that order, so the page still opens straight from disk.

The tests need Node 22 or later and Playwright. The site itself still needs neither.

```sh
npm ci
npm test
```

`npm test` runs the calculation tests and every browser suite in `tests/`. Browser suites use `CHROMIUM_PATH` if set, then `/usr/bin/chromium`, then Playwright's own Chromium (`npx playwright install chromium`). Failure screenshots land in `test-results/gui/`. Open ideas are in [docs/backlog.md](docs/backlog.md).

Pushes to `main` run every test and deploy to GitHub Pages through [deploy.yml](.github/workflows/deploy.yml). `node scripts/prepare-site.mjs` packages the static files for publishing.
