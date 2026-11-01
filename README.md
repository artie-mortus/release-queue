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

Browser storage is separate for each URL. Export and import your queue when moving between a local copy and the published site, or between browsers.

## Development

Run the core checks:

```sh
node tests/time-bridge-core.test.js
node tests/playlist-reader.test.cjs
```

Browser regression suites are in `tests/`; source audits and development notes are in `docs/`.

Pushes to `main` run the checks and deploy to GitHub Pages through [deploy.yml](.github/workflows/deploy.yml). `node scripts/prepare-site.mjs` packages the static files for publishing.
