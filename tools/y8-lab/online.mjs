// node online.mjs <build-local>   two players via QUICK MATCH, play to the end, then rematch both ways.
import { launch, open, state, sleep, clickIn } from './lib.mjs';
const build = process.argv[2];
const isNew = build.startsWith('new');
const [b1, b2] = [await launch(), await launch()];
const A = await open(b1, build), B = await open(b2, build);
const log = (...a) => console.log(`[${build} online]`, ...a);
const st = async p => ({ ...(await state(p.frame)), rematch: await p.frame.evaluate(() => { const e = document.querySelector('#rematch-status'); return e && !e.hidden ? e.textContent : ''; }), side: await p.frame.evaluate(() => document.querySelector('#side-label')?.dataset.side) });
const short = s => `${s.phase} ${s.score} "${s.winner}" rematch="${s.rematch}" side=${s.side} ctrl=${s.ctrl} actions=${s.actions} menu=${s.menu}`;
const until = async (cond, ms = 180000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await cond()) return true; await sleep(500); } return false; };
const again = isNew ? '#play-again' : '#game-control';
try {
  await clickIn(A.page, A.frame, '#quick');
  await sleep(500);
  await clickIn(B.page, B.frame, '#quick');
  const met = await until(async () => (await st(A)).side && !(await state(A.frame)).menu && (await A.frame.evaluate(() => document.querySelector('#score') && document.querySelector('#stage').dataset.phase)) && (await B.frame.evaluate(() => !document.querySelector('#side-label').hidden)) && (await A.frame.evaluate(() => document.querySelector('#queue-status').textContent)) !== 'Looking for a player…', 30000);
  await sleep(4000);
  log('matched?', met, 'A:', short(await st(A)), '| B:', short(await st(B)));
  for (let match = 1; match <= 2; match++) {
    const done = await until(async () => (await st(A)).phase === 'finished' && (await st(B)).phase === 'finished');
    const [sa, sb] = [await st(A), await st(B)];
    log(`match ${match} finished=${done}`, 'A:', short(sa), '| B:', short(sb));
    const [loser, winner, ln] = sa.winner.includes('Lose') ? [A, B, 'A'] : [B, A, 'B'];
    if (match === 1) {
      await clickIn(loser.page, loser.frame, again);
      await sleep(1500);
      log(`loser ${ln} pressed rematch:`, short(await st(loser)), '| winner:', short(await st(winner)));
      await clickIn(winner.page, winner.frame, again);
      const restarted = await until(async () => (await st(A)).phase !== 'finished' && (await st(B)).phase !== 'finished', 15000);
      log('both pressed -> restarted', restarted, 'A:', short(await st(A)), '| B:', short(await st(B)));
    } else {
      // The loser goes back to the menu while the winner waits on the result screen.
      await clickIn(loser.page, loser.frame, isNew ? '#to-menu' : '#back');
      await sleep(2500);
      log(`loser ${ln} left to menu:`, short(await st(loser)), '| winner:', short(await st(winner)));
    }
  }
} catch (e) { log('ERROR', e.message); }
await b1.close(); await b2.close();
