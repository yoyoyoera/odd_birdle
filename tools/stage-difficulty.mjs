// Repeatable, deliberately imperfect touch-player smoke test. This is not human telemetry.
// Run: node tools/stage-difficulty.mjs --trials 24 --seed 20261119 --seconds 600
import { pathToFileURL } from 'node:url';
import { createGame, step, center, floor } from '../game.js';
import { stages } from '../stages.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const seeded = initial => {
  let state = initial >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
};

// Perception updates at 10 Hz and arrives 100 ms late. A touch stroke takes 160 ms;
// the finger is lifted between strokes. No collision oracle or future-flight solver is used.
export function makePlayer(random, rules) {
  let sampleAt = 0, decideAt = 0, previous, sight, stroke;
  const samples = [];
  return (game, time) => {
    const view = game.view();
    if (view.phase !== 'live') {
      game.moveRacket('left', null);
      previous = sight = stroke = undefined;
      samples.length = 0;
      return;
    }
    if (time >= sampleAt) {
      sampleAt = time + 0.1;
      let target = view.shuttle;
      // Sometimes follow a fake. This approximates confusion, not human visual tracking.
      if (view.decoys?.length && random() < 0.25) target = view.decoys[Math.floor(random() * view.decoys.length)];
      if (target) samples.push({ x: target.x, y: target.y, time, deliver: time + 0.1 });
    }
    while (samples.length && samples[0].deliver <= time) {
      const next = samples.shift();
      const elapsed = previous ? next.time - previous.time : 0;
      const close = previous && Math.hypot(next.x - previous.x, next.y - previous.y) < 180;
      sight = { ...next, vx: close ? (next.x - previous.x) / elapsed : 0,
        vy: close ? (next.y - previous.y) / elapsed : 0 };
      previous = next;
    }
    if (stroke) {
      const fraction = clamp((time - stroke.time) / stroke.duration, 0, 1);
      game.moveRacket('left', { x: stroke.x + stroke.dx * fraction,
        y: stroke.y + stroke.dy * fraction, time: time * 1000 });
      if (fraction === 1) {
        game.moveRacket('left', null);
        stroke = undefined;
        decideAt = time + 0.12 + random() * 0.08;
      }
      return;
    }
    if (!sight || time < decideAt) return;
    decideAt = time + 0.07;
    const lead = clamp(time - sight.time + 0.08, 0, 0.28);
    const x = sight.x + sight.vx * lead;
    const y = sight.y + sight.vy * lead + 350 * lead * lead;
    if (x < 38 || x > center - 24 || y < 205 || y > floor - 30 || sight.vy < -70) return;
    if (random() < 0.06) { decideAt = time + 0.24; return; }
    // A learned lob, with noisy aim and tempo. Moon mode needs a gentler stroke.
    const gravity = Math.sqrt(rules.gravityScale ?? 1);
    const duration = 0.16 + (random() - 0.5) * 0.025;
    const dx = clamp((700 - x) / 1.25 / 0.92, 220, 540) * duration * gravity;
    const dy = -(580 + (random() - 0.5) * 110) * duration * gravity;
    const aimX = x + (random() - 0.5) * 16;
    const aimY = y + (random() - 0.5) * 16;
    stroke = { x: aimX - dx / 2, y: aimY - dy / 2, dx, dy, duration, time };
    game.moveRacket('left', { x: stroke.x, y: stroke.y, time: time * 1000 });
  };
}

export function simulateStage(stage, { seed = 20261119, maxSeconds = 600 } = {}) {
  const originalRandom = Math.random;
  // Player noise uses an independent stream: changing perception does not reroll game events.
  const playerRandom = seeded(seed ^ 0x9e3779b9);
  Math.random = seeded(seed);
  try {
    const game = createGame({ withCpu: true, rules: stage.rules });
    game.restart(0, stage.rules.cpuLevel, stage.rules);
    const play = makePlayer(playerRandom, stage.rules);
    let time = 0;
    for (; time < maxSeconds; time += step) {
      play(game, time);
      game.simulate(step);
      const frame = game.view();
      if (frame.shuttle && !['x', 'y', 'size', 'angle'].every(key => Number.isFinite(frame.shuttle[key]))) {
        throw new Error(`Non-finite shuttle at stage ${stage.id}, seed ${seed}, time ${time}`);
      }
      if (frame.phase === 'finished') break;
    }
    const view = game.view();
    return { winner: view.winner ?? null, seconds: Number(time.toFixed(2)), score: { ...view.score } };
  } finally {
    Math.random = originalRandom;
  }
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function measureStages({ trials = 24, seed = 20261119, maxSeconds = 600, ids } = {}) {
  return stages.filter(stage => !ids || ids.includes(stage.id)).map(stage => {
    const matches = Array.from({ length: trials }, (_, trial) => simulateStage(stage, {
      seed: seed + stage.id * 100003 + trial * 7919, maxSeconds
    }));
    const wins = matches.filter(match => match.winner === 'left').length;
    return { id: stage.id, name: stage.name, trials, wins,
      winRate: Number((100 * wins / trials).toFixed(1)),
      medianSeconds: Number(median(matches.map(match => match.seconds)).toFixed(1)),
      meanSeconds: Number((matches.reduce((total, match) => total + match.seconds, 0) / trials).toFixed(1)),
      timeouts: matches.filter(match => match.winner === null).length,
      playerPoints: matches.reduce((total, match) => total + match.score.left, 0),
      cpuPoints: matches.reduce((total, match) => total + match.score.right - (stage.rules.startScore?.right ?? 0), 0)
    };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const option = (name, fallback) => {
    const at = process.argv.indexOf(name);
    return at >= 0 ? process.argv[at + 1] : fallback;
  };
  const trials = Number(option('--trials', 24));
  const seed = Number(option('--seed', 20261119));
  const maxSeconds = Number(option('--seconds', 600));
  const selected = option('--stages', '');
  const ids = selected ? selected.split(',').map(Number) : undefined;
  if (!Number.isInteger(trials) || trials < 1 || trials > 1000 || !Number.isFinite(seed) ||
      !Number.isFinite(maxSeconds) || maxSeconds < 1 || (ids && ids.some(id => !Number.isInteger(id) || id < 1 || id > 21))) {
    throw new Error('Use --trials 1..1000, numeric --seed, positive --seconds and optional --stages 1,2,...');
  }
  const rows = measureStages({ trials, seed, maxSeconds, ids });
  console.log(JSON.stringify({ profile: 'delayed-touch-lob-v1', seed, maxSeconds, rows }, null, 2));
}
