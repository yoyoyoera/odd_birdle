// Builds an upload zip for a game portal from the site build.
// Usage: node scripts/build-portal.mjs crazygames|itch|newgrounds|gamepix|y8|gamedistribution  ->  portal/oddbirdle-<name>.zip
// The Android app: node scripts/build-portal.mjs app [--features=stages,daily,online]  ->  portal/app/ (Capacitor's webDir,
// no zip). Its optional parts are all off unless listed (features.js).
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Portals that must make no outside requests carry the font themselves instead of asking Google Fonts.
// The Android app is one of them: it has to start in airplane mode.
const ownFont = ['gamepix', 'y8', 'gamedistribution', 'app'];

const name = process.argv[2];
if (!['crazygames', 'itch', 'newgrounds', 'gamepix', 'y8', 'gamedistribution', 'app'].includes(name)) {
  console.error('Usage: node scripts/build-portal.mjs crazygames|itch|newgrounds|gamepix|y8|gamedistribution|app');
  process.exit(1);
}
const appFeatures = (process.argv.find(arg => arg.startsWith('--features='))?.slice('--features='.length) ?? '')
  .split(',').map(feature => feature.trim().toLowerCase()).filter(Boolean);
for (const feature of appFeatures) {
  if (!['stages', 'daily', 'online'].includes(feature)) throw new Error('Unknown feature: ' + feature);
}
const gdPreview = name === 'gamedistribution' && process.argv.includes('--preview');
const diagnostics = name === 'gamedistribution' && process.argv.includes('--diagnostics');
const gameId = process.env.GD_GAME_ID ?? '';
if (name === 'gamedistribution' && !gdPreview && !/^[a-f0-9]{32}$/i.test(gameId)) {
  throw new Error('Set GD_GAME_ID to the game ID from your GD dashboard, or use --preview for a local build without ads.');
}
const root = new URL('../', import.meta.url);
execFileSync(process.execPath, [fileURLToPath(new URL('build-pages.js', root))], { stdio: 'inherit' });

const out = new URL(`portal/${name}/`, root);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
// Everything the game needs, all referenced by relative paths; the font page and preview image stay on the site.
cpSync(new URL('dist/', root), out, { recursive: true, filter: source => !/(?:fonts\.html|og\.png|ads\.txt)$/.test(source) });
// The app's back button and background pause; only the app build carries it (client.js loads it there).
if (name === 'app') cpSync(new URL('app-shell.js', root), new URL('app-shell.js', out));

const indexUrl = new URL('index.html', out);
let html = readFileSync(indexUrl, 'utf8');
// The user's own AdSense account belongs only to the standalone website.
// Portal versions keep their existing SDK advertising and must not load this tag.
html = html.replace(/<!-- standalone-adsense:start -->[\s\S]*?<!-- standalone-adsense:end -->/g, '');
html = html.replace('<html lang="en">', `<html lang="en" data-portal="${name}">`);
if (diagnostics) html = html.replace('data-portal="gamedistribution"', 'data-portal="gamedistribution" data-gd-diagnostics="true"');
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
if (ownFont.includes(name)) {
  // No links, previews or analytics leave the game; the portal's own SDK is the only thing loaded from outside.
  html = html
    .replace(/\s*<meta (?:property="og:|name="twitter:)[^>]*>/g, '')
    .replace(/\s*<a href="https:[^>]*>[\s\S]*?<\/a>/g, '')
    .replace('width=device-width, initial-scale=1', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .replace('>COPY LINK<', '>COPY CODE<');
}
if (name === 'app') {
  // Android 16 draws the app under the status bar, the camera cutout and the gesture bar. The page keeps clear of them:
  // Capacitor's --safe-area-inset-* when it sets them, else the WebView's env(). The court's size limits are the
  // page's own ones less those insets; with every inset at 0 the layout is the website's.
  html = html
    .replace('user-scalable=no', 'user-scalable=no, viewport-fit=cover')
    .replace('<html lang="en" data-portal="app">', `<html lang="en" data-portal="app" data-features="${appFeatures.join(' ')}">`)
    .replace('</style>', `  /* The Android app: safe areas (edge to edge). */
    html[data-portal="app"] { --app-safe-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
      --app-safe-right: var(--safe-area-inset-right, env(safe-area-inset-right, 0px));
      --app-safe-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
      --app-safe-left: var(--safe-area-inset-left, env(safe-area-inset-left, 0px));
      --app-safe-block: calc(var(--app-safe-top) + var(--app-safe-bottom)); overscroll-behavior: none; }
    html[data-portal="app"] body { padding: var(--app-safe-top) var(--app-safe-right) var(--app-safe-bottom) var(--app-safe-left);
      overscroll-behavior: none; }
    html[data-portal="app"] main { width: min(1260px, 100% - 32px, (100svh - 100px - var(--app-safe-block)) * 1.8); }
    @media (orientation: landscape) and ((pointer: coarse) or (max-height: 620px)), (min-aspect-ratio: 16/9) {
      html[data-portal="app"] main { width: min(1312px, 100% - 24px, calc((100svh - 12px - var(--app-safe-block)) * 1.8 + 52px)); }
      html[data-portal="app"][data-touch-tune-open] main {
        width: min(1384px, 100% - 24px, calc((100svh - 12px - var(--app-safe-block)) * 1.8 + 124px)); }
    }
    html[data-portal="app"][data-pad] main { width: calc(100% - 16px); }
    html[data-portal="app"] #guide { padding: calc(16px + var(--app-safe-top)) calc(16px + var(--app-safe-right))
      calc(16px + var(--app-safe-bottom)) calc(16px + var(--app-safe-left)); }
  </style>`);
}
if (name === 'gamepix') {
  html = html
    .replace('<style>', `<script>window.GamePixConfig = { lifecycle: 'manual' };</script>
  <script src="https://integration.gamepix.com/sdk/v3/gamepix.sdk.js"></script>
  <style>
    html, body { overscroll-behavior: none; }
    body { touch-action: none; }
    #gamepix-loading { position: fixed; inset: 0; z-index: 10; display: grid; place-items: center; background: #182223;
      color: #e8ebd6; font: 650 clamp(1.5rem, 6vw, 3rem) "Space Grotesk", sans-serif; letter-spacing: -.02em; }`)
    .replace(/<body([^>]*)>/, '<body$1>\n  <div id="gamepix-loading">ODD BIRDLE</div>');
}
if (name === 'gamedistribution') {
  if (!gdPreview) {
    html = html.replace('<style>', `<script>
    window.oddbirdleGdEvents = [];
    window.oddbirdleGdReady = new Promise(function (resolve) {
      window.oddbirdleGdLoaded = resolve;
      setTimeout(resolve, 6000);
    });
    window.GD_OPTIONS = {
      gameId: '${gameId}',
      onEvent: function (event) {
        if (event.name === 'SDK_READY' || event.name === 'SDK_ERROR') window.oddbirdleGdLoaded();
        if (window.oddbirdleGdEvent) window.oddbirdleGdEvent(event);
        else window.oddbirdleGdEvents.push(event);
      }
    };
  </script>
  <script src="https://html5.api.gamedistribution.com/main.js" async onerror="window.oddbirdleGdLoaded()"></script>
  <style>`);
  }
  html = html.replace('<style>', '<style>\n    html, body { overscroll-behavior: none; }\n    body { touch-action: none; }');
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
if (ownFont.includes(name)) {
  // Nothing may point anywhere else: the only web address left in the page is the portal's SDK (the app has none).
  const sdkHost = name === 'gamepix' ? 'integration.gamepix.com' : name === 'y8' ? 'cdn.y8.com'
    : name === 'app' ? undefined : 'html5.api.gamedistribution.com';
  const outside = [...html.matchAll(/https?:\/\/[^"'\s)<]+/g)].map(match => match[0]).filter(link => !sdkHost || !link.includes(sdkHost));
  if (outside.length) throw new Error(name + ' build still links out: ' + outside.join(', '));
}
if (!html.includes(`data-portal="${name}"`)) throw new Error('Could not mark index.html for the portal.');
writeFileSync(indexUrl, html);

if (name === 'app') {
  // Inside the APK nothing is fetched from the web: every file is checked, not only the page. The one address allowed is
  // the match server's (portal.js siteUrl), and it is only used by ONLINE, which this build can leave off.
  const outside = [];
  for (const file of readdirSync(out, { recursive: true })) {
    if (!/\.(?:html|js|css)$/.test(file)) continue;
    const text = readFileSync(new URL(file, out), 'utf8');
    for (const match of text.matchAll(/https?:\/\/[^"'\s)<>`]+/g)) {
      if (!(file === 'portal.js' && match[0] === 'https://oddbirdle.pages.dev/')) outside.push(file + ': ' + match[0]);
    }
  }
  if (outside.length) throw new Error('app build still reaches outside: ' + outside.join(', '));
  console.log('wrote', fileURLToPath(out));
  process.exit(0);
}

const zip = fileURLToPath(new URL(`portal/oddbirdle-${name}${gdPreview ? "-preview" : ""}${diagnostics ? "-diagnostics" : ""}.zip`, root));
rmSync(zip, { force: true });
execFileSync('zip', ['-qr', zip, '.'], { cwd: fileURLToPath(out) });
console.log('wrote', zip);
