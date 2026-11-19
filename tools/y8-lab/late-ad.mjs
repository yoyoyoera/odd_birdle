// The SDK reports the ad only after the game stopped waiting for it (1.0.1 waits 20 s, later builds 3 s):
// beforeAd 1 s after that, afterAd 2 s later.
import { launch, open, sleep } from './lib.mjs';
const build = process.argv[2];
const browser = await launch();
const { frame } = await open(browser, build);
const wait = build.startsWith('ready') ? 20000 : 3000;
const r = await frame.evaluate(async wait => {
  const p = await import('./portal.js');
  window.y8Sdk.showAd = o => { setTimeout(o.beforeAd, wait + 1000); setTimeout(() => { o.afterAd(); o.adBreakDone?.({ breakStatus: 'viewed' }); }, wait + 3000); return new Promise(() => {}); };
  p.matchEnded(false); p.matchEnded(false); p.matchEnded(false);
  const t0 = performance.now();
  await p.matchBreak({ rematch: true });
  const released = Math.round(performance.now() - t0);
  await new Promise(r => setTimeout(r, 1500));
  const duringAd = p.isPaused();
  await new Promise(r => setTimeout(r, 3000));
  return { released, duringAd, afterAdEnded: p.isPaused() };
}, wait);
console.log(build, JSON.stringify(r), r.afterAdEnded ? 'STUCK (paused for good)' : 'OK');
await browser.close();
