import test from 'node:test';
import assert from 'node:assert/strict';
import {
  center, createGame, effectLabels, floor, netTop, projectStrike, shapeCount, shuttleOutline, shuttleSizeOptions, step
} from '../game.js';

const L = shapeCount - 1;
const run = (game, seconds) => { for (let i = 0; i < Math.round(seconds / step); i++) game.simulate(step); };

function seeded(seed) {
  let value = seed;
  return () => (value = (value * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

const area = points => Math.abs(points.reduce((sum, [x, y], i) => {
  const [nx, ny] = points[(i + 1) % points.length];
  return sum + x * ny - nx * y;
}, 0)) / 2;

function hullArea(points) {
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => {
    const out = [];
    for (const point of list) {
      while (out.length >= 2 && cross(out.at(-2), out.at(-1), point) <= 0) out.pop();
      out.push(point);
    }
    return out.slice(0, -1);
  };
  return area([...half(sorted), ...half(sorted.slice().reverse())]);
}

test('the L shuttle is a lopsided, concave shape added after the older ones', () => {
  assert.equal(shapeCount, 12);
  const [ring] = shuttleOutline({ shape: L, size: 21, angle: 0, x: 0, y: 0 });
  const points = ring.map(({ x, y }) => [x, y]);
  assert.ok(area(points) < hullArea(points) * 0.8, 'it has a notch, so it is concave');
  // Lopsided: turning it half a turn gives a different silhouette.
  const turned = shuttleOutline({ shape: L, size: 21, angle: Math.PI, x: 0, y: 0 })[0].map(({ x, y }) => [x, y]);
  const key = list => list.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).sort().join(' ');
  assert.notEqual(key(points), key(turned));
  // The same overall size as the other shapes at each tier.
  const reach = shape => Math.max(...shuttleOutline({ shape, size: 21, angle: 0, x: 0, y: 0 }).flat()
    .flatMap(a => shuttleOutline({ shape, size: 21, angle: 0, x: 0, y: 0 }).flat().map(b => Math.hypot(a.x - b.x, a.y - b.y))));
  assert.ok(Math.abs(reach(L) - reach(3)) < 0.5, `L spans ${reach(L)}, bar ${reach(3)}`);
});

test('every shape in every size can be hit over the net, even a tall one', () => {
  const height = floor - netTop;
  for (const top of [floor - height * 1.4, floor - height * 1.4 * 2]) {
    for (let shape = 0; shape < shapeCount; shape++) {
      for (const size of shuttleSizeOptions) {
        let clears = false;
        search: for (let x = 250; x <= 430; x += 45) {
          for (let y = 200; y <= 440; y += 40) {
            for (const vx of [200, 450, 700, 950]) {
              for (let t = 0; t < 3; t += 0.004) {
                const p = projectStrike({ x, y, shape, size, baseSize: size, angle: 0 }, { vx, vy: -1400 }, t);
                if (p.x < center) continue;
                const bottom = Math.max(...shuttleOutline({ ...p, size }).flat().map(point => point.y));
                if (p.y + bottom < top - 2) { clears = true; break search; }
                break;
              }
            }
          }
        }
        assert.ok(clears, `shape ${shape} size ${size} cannot clear a net with its top at y=${Math.round(top)}`);
      }
    }
  }
});

test('a pinned shape and size stay for every serve until released', t => {
  t.mock.method(Math, 'random', seeded(5));
  const game = createGame({ withCpu: true });
  game.setShuttle({ shape: L, size: 2 });
  game.restart(0, 4);
  const seen = new Set();
  for (let serves = 0; serves < 4; serves++) {
    const bird = game.view().shuttle;
    seen.add(`${bird.shape}/${bird.baseSize}`);
    // Play until this point ends and the next serve starts.
    let guard = 0;
    while (game.view().phase === 'live' && guard++ < 4000) run(game, 0.05);
    guard = 0;
    while (game.view().phase !== 'live' && guard++ < 400) run(game, 0.05);
  }
  assert.deepEqual([...seen], ['11/34']);
  game.setShuttle({});
  const shapes = new Set();
  for (let matches = 0; matches < 10; matches++) {
    game.restart(0, 4);
    shapes.add(game.view().shuttle.shape);
  }
  assert.ok(shapes.size > 2, 'shapes vary again once released');
  // Nonsense choices mean random, never a crash.
  game.setShuttle({ shape: 99, size: -1 });
  run(game, 0.5);
});

test('random effects can be switched off for recording', t => {
  // With effects on, a rally that goes on long enough starts the effect countdown (3, 2, ...).
  // Short idle-side rallies never finish a countdown, so the countdown itself is the signal.
  const countdowns = effectsOn => {
    t.mock.method(Math, 'random', seeded(21));
    const game = createGame({ withCpu: true });
    game.setEffects(effectsOn);
    let seen = 0;
    for (let match = 0; match < 20; match++) {
      game.restart(0, 4);
      for (let i = 0; i < 2000 && game.view().phase !== 'finished'; i++) {
        run(game, 0.05);
        const text = game.view().eventText;
        if (/^\d$/.test(text) || effectLabels.some(label => text.startsWith(label))) seen++;
      }
    }
    t.mock.restoreAll();
    return seen;
  };
  assert.ok(countdowns(true) > 0, 'the countdown shows up when effects are on');
  assert.equal(countdowns(false), 0, 'and never when they are off');
});
