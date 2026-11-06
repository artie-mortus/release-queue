# Release Queue

Plan what to play, watch, and read before a game releases. Release Queue estimates whether your queue will fill the wait based on your available time and remaining progress.

[Open Release Queue](https://artie-mortus.github.io/release-queue/)

- Track games, TV, movies, books, podcasts, web fiction, and YouTube playlists.
- Choose a target game and release date.
- Adjust your weekly time budget and recurring YouTube time.
- See projected finish dates and compare different paces.
- Record progress, keep completed items, and undo changes.

Runtime estimates are editable. Missing runtimes need an estimate, and public lookup services may sometimes be unavailable.

## Run locally

Open `index.html` in your browser, or serve the folder:

```sh
python3 -m http.server 8000
```

Then visit [localhost:8000](http://localhost:8000). The app uses plain HTML, CSS, and JavaScript. No account, backend, package install, or build step is required.

## Save your queue

Your queue saves automatically in your browser. In **Settings**, use **Export queue** to download a Markdown backup and **Load file** to restore it. ZIP files containing one Markdown backup are also supported, up to 10 MiB.

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
