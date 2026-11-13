// Builds an upload zip for a game portal from the site build.
// Usage: node scripts/build-portal.mjs crazygames|itch|newgrounds  ->  portal/oddbirdle-<name>.zip
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const name = process.argv[2];
if (!['crazygames', 'itch', 'newgrounds'].includes(name)) {
  console.error('Usage: node scripts/build-portal.mjs crazygames|itch|newgrounds');
  process.exit(1);
}
const root = new URL('../', import.meta.url);
execFileSync(process.execPath, [new URL('build-pages.js', root).pathname], { stdio: 'inherit' });

const out = new URL(`portal/${name}/`, root);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
// Everything the game needs, all referenced by relative paths; the font page and preview image stay on the site.
cpSync(new URL('dist/', root), out, { recursive: true, filter: source => !/fonts\.html$|og\.png$/.test(source) });

const indexUrl = new URL('index.html', out);
let html = readFileSync(indexUrl, 'utf8');
html = html.replace('<html lang="en">', `<html lang="en" data-portal="${name}">`);
if (name === 'crazygames') {
  // SDK v3 must load before the game code.
  html = html.replace('<link rel="stylesheet"', '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n  <link rel="stylesheet"');
}
if (!html.includes(`data-portal="${name}"`)) throw new Error('Could not mark index.html for the portal.');
writeFileSync(indexUrl, html);

const zip = new URL(`portal/oddbirdle-${name}.zip`, root).pathname;
rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, '.'], { cwd: out.pathname });
console.log('wrote', zip);
