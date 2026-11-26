import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../game.js';
import { callOf, confidence, createGlassesScript, glitchText, labelText, parseGlasses } from '../glasses.js';

test('the glasses are off unless the address asks, and the address says how the effects come', () => {
  assert.deepEqual(parseGlasses(''), { on: false });
  assert.deepEqual(parseGlasses('?glasses=0'), { on: false });
  assert.deepEqual(parseGlasses('?glasses=1'), { on: true, effects: [], rally: 2, after: 2, lang: 'en' });
  const set = parseGlasses('?glasses=1&effect=GUST,decoy,nonsense,highnet&rally=3&after=4.5&lang=ko');
  assert.deepEqual(set, { on: true, effects: ['wind', 'decoy', 'highNet'], rally: 3, after: 4.5, lang: 'ko' });
  assert.equal(parseGlasses('?glasses=1&rally=0&after=-1').rally, 2, 'nonsense falls back');
});

const live = (total, extra = {}) => ({ phase: 'live', score: { left: total, right: 0 }, ...extra });

test('scripted effects come one per rally, in order, once their rally and second have come', () => {
  const script = createGlassesScript({ effects: ['wind', 'decoy'], rally: 2, after: 2 });
  const fired = [];
  const trigger = id => (fired.push(id), true);
  for (let i = 0; i < 400; i++) script.update(live(0), 0.016, trigger);
  assert.deepEqual(fired, [], 'rally 1 stays clean');
  for (let i = 0; i < 100; i++) script.update(live(1), 0.016, trigger);
  assert.deepEqual(fired, [], 'not before 2 s into rally 2');
  for (let i = 0; i < 40; i++) script.update(live(1), 0.016, trigger);
  assert.deepEqual(fired, ['wind']);
  for (let i = 0; i < 400; i++) script.update(live(1, { effect: 'wind' }), 0.016, trigger);
  for (let i = 0; i < 400; i++) script.update(live(1), 0.016, trigger);
  assert.deepEqual(fired, ['wind'], 'one per rally');
  for (let i = 0; i < 200; i++) script.update(live(2), 0.016, trigger);
  assert.deepEqual(fired, ['wind', 'decoy'], 'the next rally, the next effect');
  assert.equal(script.pending, 0);
});

test('an effect that could not start is tried again, and a new match starts the list over', () => {
  const script = createGlassesScript({ effects: ['bumper'], rally: 1, after: 0 });
  let allowed = false;
  const tries = [];
  const trigger = id => (tries.push(id), allowed);
  script.update(live(0), 0.016, trigger);
  script.update(live(0), 0.016, trigger);
  allowed = true;
  script.update(live(0), 0.016, trigger);
  assert.deepEqual(tries, ['bumper', 'bumper', 'bumper']);
  assert.equal(script.pending, 0);
  script.update(live(0), 0.016, trigger);
  script.update(live(1), 0.016, trigger);
  assert.equal(tries.length, 3, 'once in a match');
  script.update({ phase: 'starting', score: { left: 0, right: 0 } }, 0.016, trigger);
  script.update(live(0), 0.016, trigger);
  assert.equal(tries.length, 4, 'and again in the next match');
});

test('the words: how sure it is, in or out, and the glitch lines (also in Korean)', () => {
  assert.equal(callOf({ x: 300 }), 'in');
  assert.equal(callOf({ x: 10 }), 'out');
  assert.equal(callOf({ x: 300, net: true }), 'net');
  assert.equal(labelText('en', { x: 300 }, 0), 'AI: 99% IN');
  assert.equal(labelText('ko', { x: 300 }, 3), 'AI: 97% 인');
  assert.equal(labelText('ko', { x: 880 }, 0), 'AI: 99% 아웃');
  assert.ok(confidence(0, { x: 70 }) < confidence(0, { x: 300 }), 'less sure near a line');
  assert.deepEqual([0, 420, 840].map(t => glitchText('en', t)), ['AI: ???', 'ERROR', 'RECALCULATING…']);
  assert.deepEqual([0, 420, 840].map(t => glitchText('ko', t)), ['AI: ???', '오류', '재계산 중…']);
});

// A shuttle the CPU hit towards the player's side, flying on its own: where does it come down?
function landing(game, setup, effect) {
  game.restart(0, 1);
  game.setEffects(false);
  for (let i = 0; i < 5; i++) game.simulate(step);
  game.testShot({ hitter: 'right', ...setup });
  if (effect) assert.ok(game.triggerEffect(effect), effect);
  const predicted = game.predictFlight();
  let last;
  for (let i = 0; i < 1200 && game.view().phase === 'live'; i++) {
    last = game.view().shuttle?.x ?? last;
    game.simulate(step);
  }
  return { predicted, actualX: last };
}
// A clear that gets well over the net, so only the flight maths decides where it lands.
const incoming = { x: 700, y: 100, vx: -420, vy: -380 };

test('in normal play the glasses are right: the line ends where the shuttle comes down', () => {
  const { predicted, actualX } = landing(createGame({ withCpu: true }), incoming);
  assert.ok(predicted.shuttle.landing, 'it will come down');
  assert.ok(Math.abs(predicted.shuttle.landing.x - actualX) < 12, `${predicted.shuttle.landing.x} vs ${actualX}`);
  assert.ok(predicted.shuttle.path.length > 8);
  assert.equal(predicted.lastHitter, 'right');
});

test('with an effect running they are wrong, because they only know normal play', () => {
  // (BUMPER only matters when the shuttle meets the post, and FREEZE only makes it late, so they are not measured here.)
  for (const effect of ['wind', 'balloon', 'trampoline']) {
    let worst = 0;
    for (let k = 0; k < 6; k++) {
      const game = createGame({ withCpu: true });
      const { predicted, actualX } = landing(game, { ...incoming, x: 640 + k * 20 }, effect);
      worst = Math.max(worst, Math.abs(predicted.shuttle.landing.x - actualX));
    }
    assert.ok(worst > 50, `${effect} threw the shuttle off by ${worst}`);
  }
});

test('DECOY: the glasses draw a line for each fake as well as for the real shuttle', () => {
  const game = createGame({ withCpu: true });
  const { predicted } = landing(game, incoming, 'decoy');
  assert.equal(predicted.decoys.length, 2);
  for (const entry of predicted.decoys) assert.ok(entry.path.length > 3 && entry.landing);
  assert.notEqual(Math.round(predicted.decoys[0].landing.x), Math.round(predicted.decoys[1].landing.x));
});

test('there is nothing to predict when no rally is live', () => {
  const game = createGame({ withCpu: true });
  game.restart(3, 1);
  assert.equal(game.predictFlight(), undefined);
});
