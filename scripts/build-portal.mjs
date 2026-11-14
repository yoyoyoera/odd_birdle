// Builds an upload zip for a game portal from the site build.
// Usage: node scripts/build-portal.mjs crazygames|itch|newgrounds|gamepix  ->  portal/oddbirdle-<name>.zip
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const name = process.argv[2];
if (!['crazygames', 'itch', 'newgrounds', 'gamepix'].includes(name)) {
  console.error('Usage: node scripts/build-portal.mjs crazygames|itch|newgrounds|gamepix');
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
if (name === 'gamepix') {
  // GamePix: the SDK is the only thing loaded from outside; no links, fonts, previews or analytics leave the game.
  html = html
    .replace(/\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '')
    .replace(/\s*<meta (?:property="og:|name="twitter:)[^>]*>/g, '')
    .replace(/\s*<a href="https:[^>]*>[\s\S]*?<\/a>/g, '')
    .replace('width=device-width, initial-scale=1', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .replace('>COPY LINK<', '>COPY CODE<')
    .replace('<style>', `<script>window.GamePixConfig = { lifecycle: 'manual' };</script>
  <script src="https://integration.gamepix.com/sdk/v3/gamepix.sdk.js"></script>
  <style>
    body { touch-action: none; }
    #gamepix-loading { position: fixed; inset: 0; z-index: 10; display: grid; place-items: center; background: #182223;
      color: #e8ebd6; font: 650 clamp(1.5rem, 6vw, 3rem) system-ui, sans-serif; letter-spacing: -.02em; }`)
    .replace(/<body([^>]*)>/, '<body$1>\n  <div id="gamepix-loading">ODD BIRDLE</div>');
  // Nothing may point anywhere else: the only web address left in the page is the SDK.
  const outside = [...html.matchAll(/https?:\/\/[^"'\s)<]+/g)].map(match => match[0]).filter(link => !link.includes('integration.gamepix.com'));
  if (outside.length) throw new Error('GamePix build still links out: ' + outside.join(', '));
}
if (!html.includes(`data-portal="${name}"`)) throw new Error('Could not mark index.html for the portal.');
writeFileSync(indexUrl, html);

const zip = new URL(`portal/oddbirdle-${name}.zip`, root).pathname;
rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, '.'], { cwd: out.pathname });
console.log('wrote', zip);
