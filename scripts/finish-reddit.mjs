// Runs as the last step of the Devvit app's build (devvit.json "scripts.build"), so `devvit upload` and playtest
// always ship the game: builds the reddit portal and lays it over dist/client, replacing the template's game.html.
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const app = new URL('reddit/odd-birdle/', root);
execFileSync(process.execPath, [fileURLToPath(new URL('scripts/build-portal.mjs', root)), 'reddit'], { stdio: 'inherit' });
cpSync(new URL('portal/reddit/', root), new URL('dist/client/', app), { recursive: true });
// Each page gets its own comment so the three files never share one hash: identical uploads can lose a path.
const gameHtml = readFileSync(new URL('portal/reddit/index.html', root), 'utf8');
for (const page of ['game.html', 'splash.html']) writeFileSync(new URL(page, new URL('dist/client/', app)), gameHtml + `\n<!-- ${page} ${Date.now()} -->\n`);
console.log('Odd Birdle game laid over dist/client');
