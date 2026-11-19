// Runs as the last step of the Devvit app's build (devvit.json "scripts.build"), so `devvit upload` and playtest
// always ship the game: builds the reddit portal and lays it over dist/client, replacing the template's game.html.
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const app = new URL('reddit/odd-birdle/', root);
execFileSync(process.execPath, [fileURLToPath(new URL('scripts/build-portal.mjs', root)), 'reddit'], { stdio: 'inherit' });
cpSync(new URL('portal/reddit/', root), new URL('dist/client/', app), { recursive: true });
for (const page of ['game.html', 'splash.html']) copyFileSync(new URL('portal/reddit/index.html', root), new URL(page, new URL('dist/client/', app)));
console.log('Odd Birdle game laid over dist/client');
