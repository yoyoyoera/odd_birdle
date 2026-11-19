// Builds the Devvit app in reddit/odd-birdle: the template's own build, then the Odd Birdle game laid over it as
// the expanded "game" entry (index.html). Usage: node scripts/build-reddit.mjs
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const app = new URL('reddit/odd-birdle/', root);
execFileSync(process.execPath, [fileURLToPath(new URL('scripts/build-portal.mjs', root)), 'reddit'], { stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: fileURLToPath(app), stdio: 'inherit' });
cpSync(new URL('portal/reddit/', root), new URL('dist/client/', app), { recursive: true });
// The template's game.html is the build's entry point; the game replaces it.
copyFileSync(new URL('portal/reddit/index.html', root), new URL('dist/client/game.html', app));
console.log('Devvit app ready in reddit/odd-birdle/dist');
