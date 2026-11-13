import test from 'node:test';
import assert from 'node:assert/strict';
import { floor } from '../game.js';
import {
  createJuiceTracker, cpuWins, dustAt, hintSeen, juiceTiming, makeDust, markHintSeen, noteCpuWin,
  resetJuiceRecords, squashAmount, strongHitSpeed
} from '../juice.js';

const pose = (x, y) => ({ x, y, shape: 0, size: 21, angle: 0 });
const live = (shuttle, extra = {}) => ({ phase: 'live', flash: 0, score: { left: 0, right: 0 }, shuttle, ...extra });

function memoryStorage() {
  const items = new Map();
  return {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: key => items.delete(key)
  };
}
const blocked = {
  getItem() { throw new Error('blocked'); },
  setItem() { throw new Error('blocked'); },
  removeItem() { throw new Error('blocked'); }
};

test('a hit is reported once, on the next frame, with its side, direction and strength', () => {
  const tracker = createJuiceTracker();
  assert.deepEqual(tracker.update(live(pose(200, 200)), 0), []);
  assert.deepEqual(tracker.update(live(pose(200, 200), { flash: 0.22 }), 16), []);
  const [hit] = tracker.update(live(pose(220, 190), { flash: 0.2 }), 32);
  assert.equal(hit.type, 'hit');
  assert.equal(hit.side, 'left');
  assert.ok(hit.strong, `speed ${hit.speed}`);
  assert.ok(Math.abs(hit.angle - Math.atan2(-10, 20)) < 1e-9);
  // The server's copy of a predicted hit a moment later is the same hit.
  tracker.update(live(pose(240, 180), { flash: 0 }), 48);
  assert.deepEqual(tracker.update(live(pose(260, 170), { flash: 0.22 }), 64), []);
  assert.deepEqual(tracker.update(live(pose(280, 160), { flash: 0.2 }), 80), []);
});

test('a soft hit is not strong', () => {
  const tracker = createJuiceTracker();
  tracker.update(live(pose(700, 200)), 0);
  tracker.update(live(pose(700, 200), { flash: 0.22 }), 16);
  const [hit] = tracker.update(live(pose(702, 199), { flash: 0.2 }), 32);
  assert.equal(hit.side, 'right');
  assert.ok(!hit.strong && hit.speed < strongHitSpeed);
});

test('landing and points are reported once each', () => {
  const tracker = createJuiceTracker();
  tracker.update(live(pose(300, floor - 60)), 0);
  const landed = tracker.update(live(pose(310, floor - 10)), 16);
  assert.deepEqual(landed, [{ type: 'land', x: 310 }]);
  assert.deepEqual(tracker.update(live(pose(310, floor - 10)), 32), []);
  const scored = tracker.update(live(pose(310, floor - 10), { phase: 'between', score: { left: 0, right: 1 } }), 48);
  assert.deepEqual(scored, [{ type: 'score', side: 'right' }]);
  assert.deepEqual(tracker.update(live(pose(310, floor - 10), { phase: 'between', score: { left: 0, right: 1 } }), 64), []);
  // A new match going back to 0:0 is not a point.
  assert.deepEqual(tracker.update(live(pose(310, 100)), 80), []);
});

test('every touch is over within 0.3 seconds', () => {
  for (const ms of Object.entries(juiceTiming).filter(([key]) => key !== 'hintFadeMs').map(([, value]) => value)) {
    assert.ok(ms <= 300, `${ms}ms`);
  }
  assert.ok(squashAmount(0) > 0);
  assert.equal(squashAmount(juiceTiming.squashMs), 0);
  const specks = makeDust(400, 1000);
  assert.ok(specks.length >= 2 && specks.length <= 3);
  for (const speck of specks) {
    const start = dustAt(speck, 1000);
    assert.ok(start.alpha === 1 && start.y <= floor);
    assert.equal(dustAt(speck, 1000 + juiceTiming.dustMs), undefined);
  }
});

test('the first hint and first wins are remembered, and storage problems are harmless', () => {
  const storage = memoryStorage();
  assert.equal(hintSeen(storage), false);
  markHintSeen(storage);
  assert.equal(hintSeen(storage), true);
  assert.equal(noteCpuWin(storage, 4), true);
  assert.equal(noteCpuWin(storage, 4), false);
  assert.equal(noteCpuWin(storage, 2), true);
  assert.deepEqual(cpuWins(storage), [2, 4]);
  assert.equal(noteCpuWin(storage, undefined), false);
  resetJuiceRecords(storage);
  assert.equal(hintSeen(storage), false);
  assert.deepEqual(cpuWins(storage), []);

  storage.setItem('oddbirdle-cpu-wins', 'not json');
  assert.deepEqual(cpuWins(storage), []);
  for (const broken of [blocked, undefined]) {
    assert.equal(hintSeen(broken), false);
    markHintSeen(broken);
    assert.equal(noteCpuWin(broken, 3), true);
    resetJuiceRecords(broken);
  }
});

test('score events say which side scored', () => {
  const tracker = createJuiceTracker();
  tracker.update(live(pose(310, 200)), 0);
  assert.deepEqual(tracker.update(live(pose(310, 200), { score: { left: 1, right: 0 } }), 16), [{ type: 'score', side: 'left' }]);
  assert.deepEqual(tracker.update(live(pose(310, 200), { score: { left: 1, right: 1 } }), 32), [{ type: 'score', side: 'right' }]);
});
