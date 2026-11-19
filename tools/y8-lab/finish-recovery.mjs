// Check the normal loss and replay flow, optionally failing one sound or draw on the loss screen.
// node finish-recovery.mjs ready|new none|audio|canvas [stuck|recovered]
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { clickIn, open, untilPhase } from './lib.mjs';

const [build = 'new', fault = 'none', expected = 'recovered'] = process.argv.slice(2);
assert.ok(['ready', 'new'].includes(build) && ['none', 'audio', 'canvas'].includes(fault));
assert.ok(['stuck', 'recovered'].includes(expected));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  // Keep the normal audio gesture policy, including Chrome's default headless output muting.
});
try {
  const { page, frame, logs } = await open(browser, build);
  await clickIn(page, frame, '#cpu');
  await untilPhase(frame, 'live');
  await frame.evaluate(fault => {
    window.injected = false;
    if (fault === 'none') return;
    const target = fault === 'audio' ? AudioBufferSourceNode.prototype : CanvasRenderingContext2D.prototype;
    const key = fault === 'audio' ? 'start' : 'fill';
    const original = target[key];
    target[key] = function (...args) {
      if (document.querySelector('#winner').textContent.includes('Lose')) {
        target[key] = original;
        window.injected = true;
        throw new Error('Y8 lab injected ' + fault + ' failure');
      }
      return original.apply(this, args);
    };
  }, fault);
  const loss = await untilPhase(frame, 'finished');
  assert.match(loss.winner, /Lose/);
  if (fault !== 'none') await frame.waitForFunction(() => window.injected, { timeout: 3000 });
  await clickIn(page, frame, build === 'ready' ? '#game-control' : '#play-again');
  // A stale HUD is also observed when the click handler restarts the simulation but no more frames run.
  if (expected === 'stuck') {
    await assert.rejects(untilPhase(frame, 'live', 8000), /timeout waiting for live.*finished/);
  } else {
    await untilPhase(frame, 'live', 12000);
    await clickIn(page, frame, '#back');
    await frame.waitForFunction(() => !document.querySelector('#menu').hidden);
  }
  const pageErrors = logs.filter(line => line.startsWith('pageerror:'));
  if (expected === 'stuck' && fault !== 'none') {
    assert.equal(pageErrors.length, 1);
    assert.ok(pageErrors[0].endsWith('Y8 lab injected ' + fault + ' failure'));
  } else {
    assert.deepEqual(pageErrors, []);
  }
  console.log({ build, fault, expected, winner: loss.winner, sdkLoaded: loss.y8, pageErrors });
} finally {
  await browser.close();
}
