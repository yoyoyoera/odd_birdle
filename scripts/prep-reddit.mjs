// Runs before the Devvit app's vite build (devvit.json "scripts.build"): builds the reddit portal and puts the game's
// files where vite expects the app's pages, so the Devvit build tooling sees the real pages and uploads them.
// Both entry pages (splash = the post in the feed, game = expanded) are the game itself.
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const client = new URL('reddit/odd-birdle/src/client/', root);
execFileSync(process.execPath, [fileURLToPath(new URL('scripts/build-portal.mjs', root)), 'reddit'], { stdio: 'inherit' });
cpSync(new URL('portal/reddit/', root), client, { recursive: true });
// The upload tool registers only one path for files with identical contents, and the other page is then "Not Found"
// in the post. So each page carries its own name in a comment, which makes their contents (and hashes) differ.
const html = readFileSync(new URL('portal/reddit/index.html', root), 'utf8');
for (const page of ['splash.html', 'game.html']) writeFileSync(new URL(page, client), html.replace('</body>', `<!-- ${page} -->\n</body>`));
// Devvit review looks for links out of the app: the website address the other builds carry is replaced by "/" here.
const portalFile = new URL('portal.js', client);
writeFileSync(portalFile, readFileSync(portalFile, 'utf8').replace('https://oddbirdle.pages.dev/', '/'));
console.log('Odd Birdle pages placed in src/client');
