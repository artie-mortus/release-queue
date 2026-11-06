# Repository rules

## Architecture

Keep Release Queue a static site. Features must run from `index.html` with browser-side HTML, CSS, and JavaScript.

- Preserve direct-file use and ordinary static hosting.
- Store user state in the browser or portable exported files.
- Browser requests to public services are allowed when they work without private server credentials.
- Do not introduce server-side code, a database, required cloud functions, or a required build step unless the user explicitly changes this rule.
- When a service blocks browser access, provide a static-compatible fallback or explain the limitation instead of adding a backend.

## Deployment

GitHub Pages deploys pushes to `main` through `.github/workflows/deploy.yml`. After completing project updates, run the relevant checks, commit the changes, and push to `origin/main` unless the user requests local-only work or another branch. Confirm the deployment workflow succeeds before reporting the website updated. Failed checks leave the previous deployment live.

Publish only `index.html`, `time-bridge-core.js`, `app.js`, and `assets/` using `scripts/prepare-site.mjs`. Keep browser queue exports outside the repository.

`index.html` holds the markup, styles, and the small startup scripts that must run before the page renders. `app.js` holds the interface code and loads as a classic script after `time-bridge-core.js`, so opening `index.html` directly from disk still works. `time-bridge-core.js` holds the calculations and the save format, with no DOM access.
