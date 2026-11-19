// Fills games/: ready = the Y8 1.0.1 zip (build 005) Y8 reviewed, new = the current portal/y8 build
// (run `node scripts/build-portal.mjs y8` first), and *-local copies that play online against relay.mjs.
// Usage: node prepare.mjs [path to the 1.0.1 zip, default ~/Downloads/oddbirdle-y8-ready.zip]
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('./', import.meta.url));
const games = here + 'games/';
const zip = process.argv[2] ?? homedir() + '/Downloads/oddbirdle-y8-ready.zip';
rmSync(games, { recursive: true, force: true });
mkdirSync(games + 'ready', { recursive: true });
execFileSync('unzip', ['-q', zip, '-d', games + 'ready']);
const built = fileURLToPath(new URL('../../portal/y8/', import.meta.url));
if (!existsSync(built)) throw new Error('Run node scripts/build-portal.mjs y8 first');
cpSync(built, games + 'new', { recursive: true });
for (const name of ['ready', 'new']) {
  cpSync(games + name, games + name + '-local', { recursive: true });
  const file = games + name + '-local/portal.js';
  const text = readFileSync(file, 'utf8').replace('export const serverBase = portal ? siteUrl :', "export const serverBase = portal ? 'http://127.0.0.1:8772/' :");
  if (!text.includes('127.0.0.1:8772')) throw new Error('could not point ' + name + '-local at the relay');
  writeFileSync(file, text);
}
writeFileSync(games + 'host.html', readFileSync(here + 'host/index.html', 'utf8').replace("'http://127.0.0.1:8771/' + v + '/index.html'", "v + '/index.html'"));
console.log('games ready:', ['ready', 'new', 'ready-local', 'new-local'].join(', '));
