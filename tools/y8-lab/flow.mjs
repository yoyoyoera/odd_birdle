// node flow.mjs <build> <mode: cpu|quick> <after: none|blur|blurhover> [mobile]
import { launch, open, state, sleep, clickIn, untilPhase } from './lib.mjs';
const [build, mode, after, mobile] = process.argv.slice(2);
const tap = mobile === 'mobile';
const browser = await launch();
// GD's ad frames make Chrome swap the cross-origin game frame mid-match (Puppeteer: 'detached Frame'), so GD runs same-origin.
const { page, frame, logs } = await open(browser, build, { ...(tap ? { width: 812, height: 375, mobile: true } : {}), sameOrigin: build.startsWith('gd') || build.startsWith('gp') });
const log = (...a) => console.log(`[${build} ${mode} ${after}${tap ? ' mobile' : ''}]`, ...a);
try {
  await clickIn(page, frame, mode === 'cpu' ? '#cpu' : '#quick', { tap });
  // Off the court: a pointer left where the menu button was can hold the serve up on a mirrored court forever.
  if (!tap) await page.mouse.move(2, 2);
  await sleep(1500);
  log('started', JSON.stringify(await state(frame)));
  const end = await untilPhase(frame, 'finished');
  log('finished', JSON.stringify(end));
  await sleep(1500);
  if (after === 'blur' || after === 'blurhover') {
    const input = await page.$('#box');
    await input.click();
    await sleep(800);
    log('after outside click', JSON.stringify(await state(frame)));
  }
  if (after === 'blurhover') {
    // Mouse back over the game without clicking, then wait.
    const f = await (await page.$('#game')).boundingBox();
    await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2, { steps: 5 });
    await sleep(1500);
    log('after hover back', JSON.stringify(await state(frame)));
  }
  const target = build === 'ready' ? '#game-control' : '#play-again';
  const at = await clickIn(page, frame, target, { tap });
  log('clicked', target, JSON.stringify(at));
  for (let i = 0; i < 6; i++) {
    await sleep(1000);
    const s = await state(frame);
    log(`+${i + 1}s`, JSON.stringify(s));
    if (s.phase !== 'finished') break;
  }
  const final = await state(frame);
  log(final.phase === 'finished' ? 'STUCK after restart click' : 'OK restarted');
} catch (e) {
  log('ERROR', e.message);
}
const errs = logs.filter(l => l.startsWith('pageerror') || l.startsWith('error'));
if (errs.length) log('page errors:', errs.join(' | '));
await browser.close();
