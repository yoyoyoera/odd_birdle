// Builds an upload zip for a game portal from the site build.
// Usage: node scripts/build-portal.mjs crazygames|itch|newgrounds|gamepix|y8  ->  portal/oddbirdle-<name>.zip
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

// Portals that must make no outside requests carry the font themselves instead of asking Google Fonts.
const ownFont = ['gamepix', 'y8'];

const name = process.argv[2];
if (!['crazygames', 'itch', 'newgrounds', 'gamepix', 'y8'].includes(name)) {
  console.error('Usage: node scripts/build-portal.mjs crazygames|itch|newgrounds|gamepix|y8');
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
if (ownFont.includes(name)) {
  cpSync(new URL('fonts/', root), new URL('fonts/', out), { recursive: true, filter: source => !/README\.md$/.test(source) });
  html = html.replace(/\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '').replace('<style>', `<style>
    @font-face { font-family: 'Space Grotesk'; font-style: normal; font-weight: 650; font-display: swap;
      src: url(fonts/space-grotesk-650-latin.woff2) format('woff2');
      unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }`);
}
if (name === 'gamepix' || name === 'y8') {
  // No links, previews or analytics leave the game; the portal's own SDK is the only thing loaded from outside.
  html = html
    .replace(/\s*<meta (?:property="og:|name="twitter:)[^>]*>/g, '')
    .replace(/\s*<a href="https:[^>]*>[\s\S]*?<\/a>/g, '')
    .replace('width=device-width, initial-scale=1', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .replace('>COPY LINK<', '>COPY CODE<');
}
if (name === 'gamepix') {
  html = html
    .replace('<style>', `<script>window.GamePixConfig = { lifecycle: 'manual' };</script>
  <script src="https://integration.gamepix.com/sdk/v3/gamepix.sdk.js"></script>
  <style>
    body { touch-action: none; }
    #gamepix-loading { position: fixed; inset: 0; z-index: 10; display: grid; place-items: center; background: #182223;
      color: #e8ebd6; font: 650 clamp(1.5rem, 6vw, 3rem) system-ui, sans-serif; letter-spacing: -.02em; }`)
    .replace(/<body([^>]*)>/, '<body$1>\n  <div id="gamepix-loading">ODD BIRDLE</div>');
}
if (name === 'y8') {
  // Y8's SDK, started the way its dashboard says. The page stays playable as a guest, with the SDK blocked,
  // and with ad blockers on: nothing here waits for it. The SDK object is kept on window for portal.js.
  html = html.replace('<style>', `<script src="https://cdn.y8.com/minimal-sdk/2-0/y8.min.js" async></script>
  <script>
    window.addEventListener('y8sdk.ready', function () {
      const y8Sdk = y8.sdk();
      const appConfig = { appId: '6afac5872743c205a109c6ef', autoLogin: true };
      const adConfig = { gameId: '293499', preloadAdBreaks: 'on', sound: 'on', onReady: () => {} };
      y8Sdk.init(appConfig, adConfig);
      y8Sdk.onAuth((user, error) => {});
      window.y8Sdk = y8Sdk;
    }, { once: true });
    if (window.y8 && window.y8.emitReadyEvent) { window.y8.emitReadyEvent(); }
  </script>
  <style>
    html, body { overscroll-behavior: none; }
    body { touch-action: none; }`);
}
if (name === 'gamepix' || name === 'y8') {
  // Nothing may point anywhere else: the only web address left in the page is the portal's SDK.
  const sdkHost = name === 'gamepix' ? 'integration.gamepix.com' : 'cdn.y8.com';
  const outside = [...html.matchAll(/https?:\/\/[^"'\s)<]+/g)].map(match => match[0]).filter(link => !link.includes(sdkHost));
  if (outside.length) throw new Error(name + ' build still links out: ' + outside.join(', '));
}
if (!html.includes(`data-portal="${name}"`)) throw new Error('Could not mark index.html for the portal.');
writeFileSync(indexUrl, html);

const zip = new URL(`portal/oddbirdle-${name}.zip`, root).pathname;
rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, '.'], { cwd: out.pathname });
console.log('wrote', zip);
