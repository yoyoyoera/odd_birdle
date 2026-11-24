// Layout baseline for the Android app build (portal/app/): the menu, a running CPU match and the pause screen, upright
// (390x844) and on its side (844x390), with no insets and with Android 16 edge-to-edge insets (status bar, camera cutout,
// gesture bar) the way Capacitor reports them (--safe-area-inset-* on <html>). The insets are tinted red in the
// screenshots, and every control is checked to sit outside them.
//
//   node scripts/build-portal.mjs app && node tools/app-layout/shoot.mjs
//
// Screenshots land next to this file (tools/app-layout/*.png). Exits non-zero if anything sits under an inset or off screen.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node-tools/node_modules/playwright'); }

const root = fileURLToPath(new URL('../../portal/app/', import.meta.url));
const outDir = fileURLToPath(new URL('./', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2' };
const outside = [];
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://x');
  let path = normalize(decodeURIComponent(url.pathname));
  if (path.endsWith('/')) path += 'index.html';
  try {
    const data = await readFile(join(root, path));
    response.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data);
  } catch {
    response.writeHead(404).end();
  }
}).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;

const views = [
  { name: 'portrait', width: 390, height: 844, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  { name: 'landscape', width: 844, height: 390, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  // Android 16, upright: status bar with a punch-hole camera, gesture bar.
  { name: 'portrait-insets', width: 390, height: 844, insets: { top: 52, right: 0, bottom: 24, left: 0 } },
  // On its side: the camera cutout on the left, the status bar strip and the gesture bar.
  { name: 'landscape-insets', width: 844, height: 390, insets: { top: 24, right: 24, bottom: 20, left: 52 } }
];

const browser = await playwright.chromium.launch();
const problems = [];
for (const view of views) {
  const context = await browser.newContext({
    viewport: { width: view.width, height: view.height }, deviceScaleFactor: 1, isMobile: true, hasTouch: true
  });
  // The same colours and sides every run; the hints seen. The first-play guide (phones on their side) is shown once.
  await context.addInitScript(() => {
    let seed = 7;
    Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    try {
      localStorage.setItem('oddbirdle-hint-done', '1');
      localStorage.setItem('oddbirdle-pad-hint-done', '1');
    } catch { /* fine */ }
  });
  const page = await context.newPage();
  page.on('request', request => { if (!request.url().startsWith(base)) outside.push(request.url()); });
  page.on('websocket', socket => outside.push(socket.url()));
  page.on('pageerror', error => problems.push(`${view.name}: page error ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') problems.push(`${view.name}: console ${message.text()}`); });
  page.on('response', response => { if (response.status() >= 400) problems.push(`${view.name}: ${response.status()} ${response.url()}`); });
  await page.goto(base);
  await page.evaluate(insets => {
    for (const [side, value] of Object.entries(insets)) {
      document.documentElement.style.setProperty(`--safe-area-inset-${side}`, value + 'px');
    }
    // Red bands where the system bars and the cutout would be (screenshots only; clicks pass through).
    for (const [side, value] of Object.entries(insets)) {
      if (!value) continue;
      const band = document.createElement('div');
      band.className = 'inset-band';
      band.style.cssText = `position:fixed;z-index:99;pointer-events:none;background:#ff00004d;${side}:0;` +
        (side === 'top' || side === 'bottom' ? `left:0;right:0;height:${value}px` : `top:0;bottom:0;width:${value}px`);
      document.body.append(band);
    }
    window.dispatchEvent(new Event('resize'));
  }, view.insets);
  await page.waitForTimeout(600);

  const check = async screen => {
    const found = await page.evaluate(insets => {
      const safe = { left: insets.left, top: insets.top, right: innerWidth - insets.right, bottom: innerHeight - insets.bottom };
      const bad = [];
      const selectors = ['#court', '#studio-links button:not([hidden])', '#studio-links .link', '#menu button', '#pad',
        '#touch-tune', '#game-control', '#back', '#pause-title', '#pause-detail', '#result-actions button', '#guide-card'];
      for (const selector of selectors) {
        for (const element of document.querySelectorAll(selector)) {
          const box = element.getBoundingClientRect();
          if (!box.width || !box.height || element.closest('[hidden]') || getComputedStyle(element).display === 'none') continue;
          if (box.left < safe.left - 0.5 || box.top < safe.top - 0.5 || box.right > safe.right + 0.5 || box.bottom > safe.bottom + 0.5) {
            bad.push(`${selector}${element.id ? '#' + element.id : ''} at ${Math.round(box.left)},${Math.round(box.top)}–` +
              `${Math.round(box.right)},${Math.round(box.bottom)}`);
          }
        }
      }
      if (document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight) {
        bad.push(`page scrolls ${document.documentElement.scrollWidth}x${document.documentElement.scrollHeight}`);
      }
      const court = document.querySelector('#court').getBoundingClientRect();
      return { bad, court: `${Math.round(court.width)}x${Math.round(court.height)} at ${Math.round(court.left)},${Math.round(court.top)}` };
    }, view.insets);
    for (const line of found.bad) problems.push(`${view.name} ${screen}: ${line}`);
    console.log(`${view.name} ${screen}: court ${found.court}${found.bad.length ? ' | ' + found.bad.join('; ') : ''}`);
    await page.screenshot({ path: join(outDir, `${view.name}-${screen}.png`) });
  };

  await check('menu');
  const menuButtons = await page.$$eval('#menu button', buttons => buttons.filter(b => !b.hidden).map(b => b.textContent));
  if (menuButtons.join() !== 'CPU,' + menuButtons[1] || menuButtons.length !== 2) problems.push(`${view.name}: menu shows ${menuButtons}`);
  await page.locator('#cpu').tap();
  await page.waitForTimeout(400);
  if (await page.$eval('#guide', element => !element.hidden)) {
    await check('guide');
    await page.locator('#guide-skip').tap();
  }
  await page.waitForTimeout(2600);
  await check('match');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const pauseShown = await page.$eval('#pause-overlay', element => !element.hidden);
  if (!pauseShown) problems.push(`${view.name}: back did not open the pause screen`);
  await check('paused');
  // A tap resumes (and is not taken as a press of what is under it); back twice leaves for the menu.
  await page.locator('#court').tap();
  await page.waitForTimeout(300);
  const after = await page.$eval('#pause-overlay', element => element.hidden);
  if (!after) problems.push(`${view.name}: a tap did not resume`);
  if (await page.$eval('#stage', element => element.dataset.phase) === 'ready') problems.push(`${view.name}: the tap left the match`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  if (await page.$eval('#menu', element => element.hidden)) problems.push(`${view.name}: back twice did not reach the menu`);
  await context.close();
}
await browser.close();
server.close();
if (outside.length) problems.push('requests outside the app: ' + [...new Set(outside)].join(', '));
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('layout ok, screenshots in', outDir);
