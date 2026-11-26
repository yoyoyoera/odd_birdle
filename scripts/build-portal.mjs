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
const appFeatures = (process.argv.find(arg => arg.startsWith('--features='))?.slice('--features='.length) ?? 'stages,online,daily')
  .split(',').map(feature => feature.trim().toLowerCase()).filter(Boolean);
for (const feature of appFeatures) {
  if (!['stages', 'daily', 'online'].includes(feature)) throw new Error('Unknown feature: ' + feature);
}
// A test build of the app can play on another copy of the site (a preview deploy) instead of the live one.
const serverArg = process.argv.find(arg => arg.startsWith('--server='))?.slice('--server='.length);
if (serverArg && (name !== 'app' || !/^https:\/\/[a-z0-9.-]+\/$/.test(serverArg))) throw new Error('--server=https://host/ is for the app build only');
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
  // Android 16 and the iPhone draw the app under the status bar, the camera cutout or notch and the gesture bar or home
  // indicator. The page keeps clear of them: Capacitor's --safe-area-inset-* when it sets them, else the WebView's env().
  // The court's size limits are the page's own ones less those insets.
  // The app is landscape only (Android and iOS lock it natively): data-orientation="landscape" makes client.js
  // (touch-layout.js) skip the upright thumb pad and menu, and the rules below always lay it out on its side, the icon
  // column beside the court. In a window taller than wide (Android 16 ignores the lock on large screens; the first frame
  // before the turn) that same layout is scaled to the width and centred, with no "turn your phone" screen.
  html = html
    .replace('user-scalable=no', 'user-scalable=no, viewport-fit=cover')
    .replace('<html lang="en" data-portal="app">',
      `<html lang="en" data-portal="app" data-orientation="landscape" data-features="${appFeatures.join(' ')}">`)
    .replace('</style>', `  /* The app: safe areas (edge to edge), landscape only. */
    html[data-portal="app"] { --app-safe-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
      --app-safe-right: var(--safe-area-inset-right, env(safe-area-inset-right, 0px));
      --app-safe-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
      --app-safe-left: var(--safe-area-inset-left, env(safe-area-inset-left, 0px));
      --app-safe-block: calc(var(--app-safe-top) + var(--app-safe-bottom)); overscroll-behavior: none; }
    /* No dark margins: the page is painted by client.js in the court's bands; body and the icon column let it show. */
    html[data-portal="app"] body { background: transparent; }
    /* A game, not a page: nothing to zoom, select or look up with a long press or a double tap. */
    html[data-portal="app"], html[data-portal="app"] body, html[data-portal="app"] * { touch-action: none; -webkit-user-select: none; user-select: none;
      -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
    html[data-portal="app"] input, html[data-portal="app"] input[type="range"] { touch-action: none; }
    /* The stage cards slide sideways with a finger. */
    html[data-portal="app"] #stage-list, html[data-portal="app"] #stage-list * { touch-action: pan-x; }
    html[data-portal="app"] body { padding: var(--app-safe-top) var(--app-safe-right) var(--app-safe-bottom) var(--app-safe-left);
      overscroll-behavior: none; }
    /* Fill the screen: the court is as tall as the screen (9:5, centred left to right, running a little into the side safe
       areas where the notch side only covers a small corner); the icon column and the speed slider float over the side
       strips on the right. */
    html[data-portal="app"][data-orientation="landscape"] body { padding: 0; }
    html[data-portal="app"][data-orientation="landscape"] main { display: block; padding: 0; margin: 0 auto;
      width: min(1400px, 100svh * 1.8, calc(100vw - 2 * max(var(--app-safe-left), var(--app-safe-right)) + 32px)); }
    html[data-portal="app"][data-orientation="landscape"] main { position: relative; }
    /* Odd Birdle's buttons are square. Sound, speed, back and restart sit out in the side strips, low down on the right (the
       notch is in the middle of a short side). The speed setting opens above them as + / value / − . */
    html[data-portal="app"][data-orientation="landscape"] #studio-links { position: fixed; right: 20px; bottom: 36px; top: auto; gap: 8px;
      flex-direction: column-reverse; margin: 0; z-index: 3; transform: none; }
    html[data-portal="app"] #studio-links a, html[data-portal="app"] #sound-toggle, html[data-portal="app"] #touch-tune-toggle,
    html[data-portal="app"][data-orientation="landscape"] #back, html[data-portal="app"][data-orientation="landscape"] #stage #game-control,
    html[data-portal="app"] .tune-step {
      width: 40px; height: 40px; min-width: 0; padding: 0; border: 0; border-radius: 0; opacity: 1; color: var(--ink);
      background: color-mix(in srgb, var(--ink) 9%, transparent); transition: background .15s; }
    html[data-portal="app"] #sound-toggle:active, html[data-portal="app"] #touch-tune-toggle:active, html[data-portal="app"] #back:active,
    html[data-portal="app"] #game-control:active, html[data-portal="app"] .tune-step:active { background: color-mix(in srgb, var(--ink) 22%, transparent); }
    html[data-portal="app"] #touch-tune-toggle[aria-expanded="true"] { background: color-mix(in srgb, var(--ink) 20%, transparent); }
    html[data-portal="app"][data-orientation="landscape"] #back { position: fixed; left: 20px; top: 28px; z-index: 3; font-size: 20px; }
    html[data-portal="app"][data-orientation="landscape"] #stage #game-control { position: fixed; right: 20px; left: auto; top: 28px; bottom: auto;
      transform: none; z-index: 3; display: grid; place-items: center; }
    html[data-portal="app"][data-orientation="landscape"] #touch-tune { position: fixed; right: 20px; bottom: 132px; top: auto; transform: none;
      z-index: 3; width: 40px; padding: 0; flex-direction: column; gap: 4px; align-items: stretch; background: none; color: var(--ink); }
    html[data-portal="app"] #touch-tune label, html[data-portal="app"] #touch-tune input { display: none; }
    html[data-portal="app"] #touch-tune output { min-width: 0; text-align: center; font: 650 13px "Space Grotesk", system-ui, sans-serif; }
    html[data-portal="app"] .tune-step { font: 650 22px/1 "Space Grotesk", system-ui, sans-serif; cursor: pointer; }
    /* The connection bars are for online play only. */
    html[data-portal="app"]:not([data-features~="online"]) #link-own { display: none; }
    html[data-portal="app"] #link-own[hidden] { display: none; }
    /* The page colour behind the court is the court's own, so the bars take the ink colour (the website's light-on-dark would vanish). */
    html[data-portal="app"] #link-own { color: var(--ink); }
    /* Pause covers the whole screen, the strips too. */
    html[data-portal="app"] #pause-overlay { position: fixed; inset: 0; z-index: 5; }
    /* The stage announcement before a match covers the whole screen too, not only the court. */
    html[data-portal="app"] #stage-intro { position: fixed; inset: 0; z-index: 2; }
    /* The stage list covers the whole screen, the side strips too. Its content keeps just clear of the corner buttons and the
       Dynamic Island; the cards slide out to the safe edges of the screen and fade away there. */
    html[data-portal="app"] #stage-panel { position: fixed; inset: 0; z-index: 2; box-sizing: border-box;
      --padL: max(calc(var(--app-safe-left) + 10px), 66px); --padR: max(calc(var(--app-safe-right) + 10px), 66px);
      padding: max(var(--app-safe-top), 28px) var(--padR) max(var(--app-safe-bottom), 14px) var(--padL); }
    /* The title row sits level with the back button, and the cards start below that button instead of under it. */
    html[data-portal="app"] #stage-panel header { padding: 0; min-height: 40px; }
    html[data-portal="app"] #stage-panel h2 { font-size: 32px; }
    html[data-portal="app"] #stage-count { font-size: 28px; }
    html[data-portal="app"] #stage-progress { font-size: 12px; }
    html[data-portal="app"] #stage-bar { height: 4px; margin: 8px 0 12px; }
    html[data-portal="app"] #stage-list { scrollbar-width: none;
      --bleedL: var(--padL); --bleedR: var(--padR);
      margin-left: calc(-1 * var(--bleedL)); margin-right: calc(-1 * var(--bleedR));
      padding-left: var(--bleedL); padding-right: var(--bleedR); scroll-padding-left: var(--bleedL); scroll-padding-right: var(--bleedR);
      -webkit-mask-image: linear-gradient(to right, transparent 0, #000 var(--bleedL), #000 calc(100% - var(--bleedR)), transparent 100%);
      mask-image: linear-gradient(to right, transparent 0, #000 var(--bleedL), #000 calc(100% - var(--bleedR)), transparent 100%); }
    html[data-portal="app"] #stage-list::-webkit-scrollbar { display: none; }
    /* DAILY and ACCOUNT: whole-screen sheets like the stage list, in the same square style. */
    html[data-portal="app"] #account-panel { position: fixed; inset: 0; z-index: 2; box-sizing: border-box;
      display: flex; flex-direction: column; gap: 14px; background: transparent; color: var(--ink); overflow: hidden;
      --padL: max(calc(var(--app-safe-left) + 10px), 72px); --padR: max(calc(var(--app-safe-right) + 10px), 72px);
      padding: max(var(--app-safe-top), 28px) var(--padR) max(var(--app-safe-bottom), 14px) var(--padL); }
    html[data-portal="app"] #account-panel[hidden] { display: none; }
    html[data-portal="app"] #account-panel header { display: flex; align-items: center; justify-content: space-between;
      min-height: 40px; gap: 12px; padding: 0; }
    html[data-portal="app"] #account-panel h2 { margin: 0; font-size: 32px; line-height: 1.15; }
    html[data-portal="app"] #account-panel button { min-height: 40px; padding: 0 16px; border: 0; border-radius: 0;
      background: color-mix(in srgb, var(--ink) 9%, transparent); color: var(--ink); font-family: inherit; font-weight: 650; font-size: 14px; letter-spacing: .06em; }
    html[data-portal="app"] #account-panel button:active:not(:disabled) { background: color-mix(in srgb, var(--ink) 22%, transparent); }
    html[data-portal="app"] #account-panel button:disabled { opacity: .45; }
    html[data-portal="app"] #stage[data-account] h1 { display: none; }
    /* The notice sits beside the back button, in the same square style. */
    html[data-portal="app"] #notice { position: fixed; top: 28px; left: 76px; min-height: 40px; background: color-mix(in srgb, var(--ink) 9%, var(--court)); }
    html[data-portal="app"] #notice-close { width: 40px; height: 40px; }
    /* The title sits on its own soft tile, so it reads over the crowd; the demo match shows through everything else. */
    html[data-portal="app"] #account-panel header h2 { padding: 2px 14px; background: color-mix(in srgb, var(--court) 78%, transparent);
      backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px); }
    html[data-portal="app"] #ac-side { padding: 14px 18px; background: color-mix(in srgb, var(--ink) 8%, transparent);
      backdrop-filter: blur(1.5px); -webkit-backdrop-filter: blur(1.5px); }
    html[data-portal="app"] #ac-card, html[data-portal="app"] #ac-side { margin-top: 6px; }
    html[data-portal="app"] #account-body { flex: 1; min-height: 0; display: flex; gap: 22px; align-items: stretch; }
    html[data-portal="app"] #account-body p { margin: 0; }
    html[data-portal="app"] #ac-card { flex: 0 0 38%; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 16px 20px;
      background: color-mix(in srgb, var(--ink) 8%, transparent); backdrop-filter: blur(1.5px); -webkit-backdrop-filter: blur(1.5px); }
    html[data-portal="app"] #ac-name { font-size: 30px; font-weight: 650; line-height: 1.1; overflow-wrap: anywhere; }
    html[data-portal="app"] #ac-status { font-size: 13px; letter-spacing: .1em; opacity: .7; }
    html[data-portal="app"] #ac-stats { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    html[data-portal="app"] #ac-stats[hidden] { display: none; }
    html[data-portal="app"] #ac-stats span { padding: 6px 10px; font-size: 12px; font-weight: 650; letter-spacing: .08em; background: color-mix(in srgb, var(--ink) 10%, transparent); }
    html[data-portal="app"] #ac-side { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 10px; overflow-y: auto; touch-action: pan-y; }
    html[data-portal="app"] #ac-signin p { font-size: 14px; font-weight: 650; opacity: .8; margin-bottom: 8px; }
    html[data-portal="app"] #ac-providers, html[data-portal="app"] #ac-actions { display: flex; flex-wrap: wrap; gap: 10px; }
    html[data-portal="app"] #ac-providers button { min-height: 46px; }
    html[data-portal="app"] #ac-nick { align-self: flex-start; min-height: 46px; }
    html[data-portal="app"] #ac-apple { background: var(--ink); color: var(--court); }
    html[data-portal="app"] #ac-google { background: transparent; box-shadow: inset 0 0 0 2px var(--ink); }
    html[data-portal="app"] #ac-delete { color: #a82f23; }
    /* The menu, Reddit style: the mode buttons in a column on the left, the daily card with the first five to clear it on the right.
       --cw is one hundredth of the court's width (the court fills the screen's height), so sizes follow the court like on Reddit. */
    html[data-portal="app"] { --cw: min(1.8vh, 1vw); }
    html[data-portal="app"] #menu { top: 37.5%; left: 50%; transform: translateX(-50%); width: min(80%, 92vh * 1.6); display: grid; white-space: normal;
      grid-template-columns: repeat(2, minmax(0, 1fr)) minmax(0, 2.6fr); grid-auto-rows: calc(var(--cw) * 4.6);
      grid-template-areas: "quick quick card" "create join card" "stages stages card" "cpu cpu card" "duo duo card";
      gap: calc(var(--cw) * 1) calc(var(--cw) * 1.8); align-items: stretch; }
    html[data-portal="app"] #menu[hidden] { display: none; }
    html[data-portal="app"] #menu-modes { display: contents; }
    html[data-portal="app"] #quick { grid-area: quick; } html[data-portal="app"] #create { grid-area: create; } html[data-portal="app"] #join { grid-area: join; }
    html[data-portal="app"] #stages-button { grid-area: stages; } html[data-portal="app"] #duo { grid-area: duo; }
    html[data-portal="app"] #cpu-group { grid-area: cpu; position: static; display: flex; gap: calc(var(--cw) * .8); transform: none; }
    html[data-portal="app"] #cpu-group #cpu { flex: 1 1 auto; }
    html[data-portal="app"] #cpu-group #cpu-level { position: static; transform: none; flex: 0 0 34%; font-size: max(8px, calc(var(--cw) * 1.5)); opacity: .8; }
    html[data-portal="app"] #menu button:not(#daily-button):not(#teaser-account):not(.flag) { width: 100%; height: 100%; min-height: 0; padding: 0 4px; border: 0; border-radius: 0;
      font-size: max(9px, calc(var(--cw) * 2.1)); letter-spacing: .06em; white-space: nowrap; color: var(--ink);
      background: color-mix(in srgb, var(--ink) 9%, transparent); }
    html[data-portal="app"] #menu button:not(#daily-button):not(#teaser-account):not(.flag):active { background: color-mix(in srgb, var(--ink) 22%, transparent); }
    html[data-portal="app"] #menu button[hidden] { display: none; }
    html[data-portal="app"] #daily-teaser { grid-area: card; display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto auto 1fr auto;
      min-width: 0; padding: calc(var(--cw) * 1.2) calc(var(--cw) * 1.8); text-align: left; color: var(--ink);
      background: color-mix(in srgb, var(--ink) 8%, transparent); backdrop-filter: blur(1.5px); -webkit-backdrop-filter: blur(1.5px); }
    html[data-portal="app"] #daily-teaser[hidden] { display: none; }
    html[data-portal="app"] #daily-teaser > * { grid-column: 1 / -1; }
    html[data-portal="app"] #teaser-head { display: flex; justify-content: space-between; gap: 8px; margin: 0; font-size: max(8px, calc(var(--cw) * 1.5)); font-weight: 650; letter-spacing: .08em; }
    html[data-portal="app"] #teaser-day { opacity: .7; }
    html[data-portal="app"] #teaser-name { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin: calc(var(--cw) * .2) 0 calc(var(--cw) * .1);
      font-size: max(13px, calc(var(--cw) * 3.4)); line-height: 1.05; }
    html[data-portal="app"] #teaser-streak { font-size: max(8px, calc(var(--cw) * 1.5)); font-weight: 650; letter-spacing: .08em; white-space: nowrap; color: #8a6a12; }
    html[data-portal="app"] #teaser-rule { margin: 0 0 calc(var(--cw) * .7); font-size: max(8px, calc(var(--cw) * 1.5)); font-weight: 650; letter-spacing: .1em; opacity: .75; }
    html[data-portal="app"] #teaser-board { list-style: none; margin: 0; padding: 0; display: grid; align-content: space-evenly; min-height: 0; }
    html[data-portal="app"] #teaser-board li { display: flex; align-items: center; gap: calc(var(--cw) * 1.2); font-size: max(9px, calc(var(--cw) * 1.9)); line-height: 1.2; min-width: 0; }
    html[data-portal="app"] #teaser-board .place { width: calc(var(--cw) * 3.4); font-weight: 650; opacity: .6; }
    html[data-portal="app"] #teaser-board .who { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 650; }
    html[data-portal="app"] #teaser-board .time { opacity: .75; font-variant-numeric: tabular-nums; }
    html[data-portal="app"] #teaser-board li[data-empty] { opacity: .35; }
    html[data-portal="app"] #teaser-board .flag { width: calc(var(--cw) * 3); height: calc(var(--cw) * 3); min-height: 0; padding: 0; border: 0; background: transparent;
      color: var(--ink); opacity: .4; font-size: max(9px, calc(var(--cw) * 1.7)); }
    html[data-portal="app"] #daily-button { grid-column: 1; grid-row: 5; display: flex; align-items: center; justify-content: center; gap: calc(var(--cw) * 1); width: 100%;
      height: calc(var(--cw) * 4.4); min-height: 0; margin-top: calc(var(--cw) * .8); padding: 0; border: 0; border-radius: 0;
      font-size: max(9px, calc(var(--cw) * 2)); letter-spacing: .12em; background: var(--ink); color: var(--court); }
    html[data-portal="app"] #daily-button:disabled { opacity: .55; }
    html[data-portal="app"] #daily-icon:not([hidden]) { display: block; width: calc(var(--cw) * 2.4); height: calc(var(--cw) * 2.4); }
    html[data-portal="app"] #teaser-account { grid-column: 2; grid-row: 5; align-self: end; height: calc(var(--cw) * 4.4); min-height: 0; max-width: calc(var(--cw) * 15); margin: calc(var(--cw) * .8) 0 0 calc(var(--cw) * .8);
      padding: 0 calc(var(--cw) * 1.2); border: 0; border-radius: 0; background: color-mix(in srgb, var(--ink) 12%, transparent); color: var(--ink);
      font-size: max(8px, calc(var(--cw) * 1.5)); font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    html[data-portal="app"] #teaser-account[hidden] { display: none; }
    html[data-portal="app"] #ac-message { margin: 0; min-height: 1.3em; font-size: 14px; font-weight: 650; white-space: pre-line; }
    html[data-portal="app"] #stage-prev { left: calc(var(--padL) + 4px); } html[data-portal="app"] #stage-next { right: calc(var(--padR) + 4px); }
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

if (name === 'app' && serverArg) {
  const portalFile = new URL('portal.js', out);
  writeFileSync(portalFile, readFileSync(portalFile, 'utf8').replace("'https://oddbirdle.pages.dev/'", `'${serverArg}'`));
}
if (name === 'app') {
  // Inside the APK nothing is fetched from the web: every file is checked, not only the page. The one address allowed is
  // the match server's (portal.js siteUrl), and it is only used by ONLINE, which this build can leave off.
  const outside = [];
  for (const file of readdirSync(out, { recursive: true })) {
    if (!/\.(?:html|js|css)$/.test(file)) continue;
    const text = readFileSync(new URL(file, out), 'utf8');
    for (const match of text.matchAll(/https?:\/\/[^"'\s)<>`]+/g)) {
      if (!(file === 'portal.js' && match[0] === (serverArg ?? 'https://oddbirdle.pages.dev/'))) outside.push(file + ': ' + match[0]);
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
