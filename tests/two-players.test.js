import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, center } from '../game.js';

// Two people on one device (the app's 2 PLAYERS): contact is judged from the shuttle on this device, for both rackets.
function live() {
  const game = createGame({ twoPlayers: true });
  game.restart(0, undefined, null, { touchLimit: 3 });
  // A short wait for the serve to be ready.
  for (let i = 0; i < 400 && game.view().phase !== 'live'; i++) game.simulate(step);
  assert.equal(game.view().phase, 'live');
  return game;
}

test('the right racket hits a shuttle that comes to the right side', () => {
  const game = live();
  game.moveRacket('left', { x: 100, y: 300, time: 0 });
  game.moveRacket('right', { x: 700, y: 330, time: 0 });
  game.testShot({ x: 700, y: 330, vx: 0, vy: 0, hitter: 'left' });
  const flight = game.view().shuttle.flight;
  for (let i = 0; i < 20; i++) {
    game.moveRacket('right', { x: 700, y: 330 - i * 4, time: (i + 1) * 8 });
    game.simulate(step);
  }
  assert.ok(game.view().shuttle.flight > flight, 'the right racket hit the shuttle (a new flight began)');
});

test('the left racket hits a shuttle that comes to the left side', () => {
  const game = live();
  game.moveRacket('left', { x: 200, y: 330, time: 0 });
  game.moveRacket('right', { x: 700, y: 300, time: 0 });
  game.testShot({ x: 200, y: 330, vx: 0, vy: 0, hitter: 'right' });
  const flight = game.view().shuttle.flight;
  for (let i = 0; i < 20; i++) {
    game.moveRacket('left', { x: 200, y: 330 - i * 4, time: (i + 1) * 8 });
    game.simulate(step);
  }
  assert.ok(game.view().shuttle.flight > flight, 'the left racket hit the shuttle (a new flight began)');
});

test('a racket far from the shuttle does not hit it', () => {
  const game = live();
  game.moveRacket('left', { x: 100, y: 100, time: 0 });
  game.moveRacket('right', { x: 800, y: 100, time: 0 });
  game.testShot({ x: 600, y: 400, vx: 0, vy: 0, hitter: 'left' });
  const flight = game.view().shuttle.flight;
  for (let i = 0; i < 20; i++) {
    game.moveRacket('right', { x: 800, y: 100 + i, time: i * 8 });
    game.simulate(step);
  }
  assert.equal(game.view().shuttle.flight, flight, 'nothing was hit');
  assert.ok(center > 0);
});

test('the engine for one player keeps working the same way', () => {
  const game = createGame({ withCpu: true });
  game.restart(0, 1, null, {});
  for (let i = 0; i < 400 && game.view().phase !== 'live'; i++) game.simulate(step);
  assert.equal(game.view().phase, 'live');
});

test('who serves first can be asked for, and by default it is the left', () => {
  const first = side => {
    const game = createGame({ twoPlayers: true });
    game.restart(0, undefined, null, side ? { touchLimit: 3, openingSide: side } : { touchLimit: 3 });
    return game.view().message;
  };
  assert.match(first('right'), /^right serve/);
  assert.match(first('left'), /^left serve/);
  assert.match(first(undefined), /^left serve/);
});
