import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
// Give each deployed asset a content version so cached scripts and styles cannot
// outlive the HTML that references them. Direct-file use needs no preparation.
const htmlPath = path.join(dist, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
for(const name of ['styles.css', 'time-bridge-core.js', 'lookups.js', 'app.js']){
  const version = createHash('sha256').update(readFileSync(path.join(dist, name))).digest('hex').slice(0, 12);
  html = html.replace(`"${name}"`, `"${name}?v=${version}"`);
}
writeFileSync(htmlPath, html);
console.log(dist);
