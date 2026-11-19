// Runs before the Devvit app's vite build (devvit.json "scripts.build"): builds the reddit portal and puts the game's
// files where vite expects the app's pages, so the Devvit build tooling sees the real pages and uploads them.
// Both entry pages (splash = the post in the feed, game = expanded) are the game itself.
import { execFileSync } from 'node:child_process';
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const client = new URL('reddit/odd-birdle/src/client/', root);
execFileSync(process.execPath, [fileURLToPath(new URL('scripts/build-portal.mjs', root)), 'reddit'], { stdio: 'inherit' });
cpSync(new URL('portal/reddit/', root), client, { recursive: true });
for (const page of ['splash.html', 'game.html']) cpSync(new URL('portal/reddit/index.html', root), new URL(page, client));
console.log('Odd Birdle pages placed in src/client');
