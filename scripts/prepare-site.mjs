import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Hosting preparation only. The app still runs directly from index.html.
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, '_site');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
for (const name of ['index.html', 'styles.css', 'time-bridge-core.js', 'lookups.js', 'app.js', 'assets']) {
  cpSync(path.join(root, name), path.join(dist, name), { recursive: true });
}
console.log(dist);
