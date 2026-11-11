import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, floor, netEffectTop, step } from '../game.js';
import { createPlayback } from '../playback.js';

test('net effects ease in for 1.5s, hold for 4s and restore each match baseline', () => {
  for (const base of [342, 321, 300]) for (const scale of [1.6, 0.5]) {
    const target = floor - (floor - base) * scale;
    assert.equal(netEffectTop(base, 0, scale), base);
    assert.equal(netEffectTop(base, 1.5, scale), target);
    assert.equal(netEffectTop(base, 5.5, scale), target);
    assert.equal(netEffectTop(base, 7, scale), base);
    assert.equal(netEffectTop(base, 0.75, scale), netEffectTop(base, 6.25, scale));
  }
});

test('real rallies select both effects and restore height after expiry or restart', t => {
  for (const [roll, label] of [[0.8, 'HIGH NET'], [0.95, 'LOW NET']]) {
    t.mock.method(Math, 'random', () => roll);
    const game = createGame();
    game.restart();
    const base = game.view().netTop;
    function tick(keepPlaying = true) {
      const frame = game.contactFrame();
      if (keepPlaying && frame?.canHit && frame.y > 250) {
        game.moveRacket('left', null);
        game.moveRacket('left', { x: frame.x, y: frame.y + 80, time: 0 }, frame);
        game.moveRacket('left', { x: frame.x, y: frame.y, time: 80 }, { ...frame, time: 0, age: 0 });
        game.moveRacket('left', null);
      }
      game.simulate(step);
    }
    for (let i = 0; i < 1800 && game.view().eventText !== label; i++) tick();
    assert.equal(game.view().eventText, label);
    for (let i = 0; i < 180; i++) tick();
    const top = game.view().netTop;
    assert.ok(label === 'HIGH NET' ? top < base : top > base);
    for (let i = 0; i < 660; i++) tick();
    assert.ok(Math.abs(game.view().netTop - base) < 1e-6);
    game.restart(3);
    assert.equal(game.view().netTop, base);
    t.mock.restoreAll();
  }
});

test('online playback blends the visible moving net between server samples', () => {
  const playback = createPlayback();
  playback.push(0, { phase: 'live', netTop: 340 }, 0);
  playback.push(100, { phase: 'live', netTop: 300 }, 100);
  assert.equal(playback.at(120).netTop, 320);
});

test('ending a rally or match eases the net back over 1.5 seconds', t => {
  for (const [roll, label] of [[0.8, 'HIGH NET'], [0.95, 'LOW NET']]) {
    for (const finalPoint of [false, true]) {
      t.mock.method(Math, 'random', () => roll);
      const game = createGame();
      game.restart();
      const base = game.view().netTop;
      function tick() {
        const frame = game.contactFrame();
        if (frame?.canHit && frame.y > 250) {
          game.moveRacket('left', null);
          game.moveRacket('left', { x: frame.x, y: frame.y + 80, time: 0 }, frame);
          game.moveRacket('left', { x: frame.x, y: frame.y, time: 80 }, { ...frame, time: 0, age: 0 });
          game.moveRacket('left', null);
        }
        game.simulate(step);
      }
      for (let i = 0; i < 1800 && game.view().eventText !== label; i++) tick();
      assert.equal(game.view().eventText, label);
      for (let i = 0; i < 180; i++) tick();
      const raised = game.view().netTop;
      // Seed the scoreboard for the terminal-point variant.
      if (finalPoint) game.view().score.right = 4 + Math.floor(roll * 11);
      for (let i = 0; i < 500 && game.view().phase === 'live'; i++) game.simulate(step);
      assert.equal(game.view().phase, finalPoint ? 'finished' : 'between');
      assert.equal(game.view().netTop, raised);
      for (let i = 0; i < 90; i++) game.simulate(step);
      assert.ok(Math.abs(game.view().netTop - (raised + base) / 2) < 1e-6);
      assert.equal(game.view().phase, finalPoint ? 'finished' : 'between');
      for (let i = 0; i < 90; i++) game.simulate(step);
      assert.equal(game.view().netTop, base);
      game.restart(3);
      assert.equal(game.view().netTop, base);
      t.mock.restoreAll();
    }
  }
});
