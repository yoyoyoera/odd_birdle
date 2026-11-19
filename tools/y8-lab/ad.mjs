import { launch, open, state, sleep } from './lib.mjs';
const browser = await launch();
const { page, frame, logs } = await open(browser, process.argv[2] || 'ready');
console.log('start', await state(frame));
const r = await frame.evaluate(async () => {
  const p = await import('./portal.js');
  const events = [];
  const sdk = window.y8Sdk;
  const orig = sdk.showAd.bind(sdk);
  sdk.showAd = opts => {
    const wrap = { ...opts };
    for (const k of ['beforeAd', 'afterAd', 'adBreakDone']) wrap[k] = (...a) => { events.push([k, performance.now() | 0, JSON.stringify(a[0] ?? null)]); return opts[k]?.(...a); };
    events.push(['showAd', performance.now() | 0]);
    try { const res = orig(wrap); events.push(['returned', typeof res, res && typeof res.then]); return res; } catch (e) { events.push(['threw', String(e)]); throw e; }
  };
  window.__ev = events;
  p.matchEnded(false); p.matchEnded(false); p.matchEnded(false);
  const t0 = performance.now();
  let done = false;
  p.matchBreak({ rematch: true }).then(() => { done = true; events.push(['resolved', performance.now() - t0 | 0]); });
  for (let i = 0; i < 60 && !done; i++) await new Promise(r => setTimeout(r, 1000));
  return { done, paused: p.isPaused(), events };
});
console.log(JSON.stringify(r, null, 1));
console.log(logs.slice(-15).join('\n'));
await browser.close();
