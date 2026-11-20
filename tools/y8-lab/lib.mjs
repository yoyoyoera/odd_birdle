import puppeteer from 'puppeteer-core';
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function launch() {
  return puppeteer.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
}
export async function open(browser, build, { width = 900, height = 520, mobile = false, sameOrigin = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile });
  const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text()));
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  const host = sameOrigin ? `http://127.0.0.1:8771/host.html?v=${build}` : `http://127.0.0.1:8770/index.html?v=${build}`;
  await page.goto(host, { waitUntil: 'load' });
  let frame;
  for (let i = 0; i < 50 && !frame; i++) { frame = page.frames().find(f => f.url().includes('/' + build + '/index.html')); if (!frame) await sleep(100); }
  await frame.waitForSelector('#menu');
  // GD keeps the menu locked (inert) until its SDK is ready, up to 6 s.
  await sleep(build.startsWith('gd') ? 7000 : 1500);
  return { page, frame, logs };
}
export const state = frame => frame.evaluate(() => {
  const d = document, s = d.querySelector('#stage');
  const vis = sel => { const e = d.querySelector(sel); return e ? !e.hidden : null; };
  return { phase: s.dataset.phase, score: d.querySelector('#score')?.value, winner: d.querySelector('#winner')?.textContent,
    winnerShown: vis('#winner'), paused: s.hasAttribute('data-paused'), overlay: vis('#pause-overlay'), menu: vis('#menu'),
    ctrl: vis('#game-control'), actions: vis('#result-actions'), queue: d.querySelector('#queue-status')?.textContent,
    focus: d.hasFocus(), y8: !!window.y8Sdk };
});
// A real mouse click (or tap) on an element inside the game frame.
export async function clickIn(page, frame, selector, { tap = false } = {}) {
  const el = await frame.$(selector);
  if (!el) throw new Error('no ' + selector);
  const box = await el.boundingBox();
  if (!box) throw new Error(selector + ' not visible');
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  if (tap) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
  return { x, y };
}
export async function untilPhase(frame, phase, ms = 150000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const s = await state(frame); if (s.phase === phase) return s; await sleep(500); }
  throw new Error('timeout waiting for ' + phase + ' ' + JSON.stringify(await state(frame)));
}
