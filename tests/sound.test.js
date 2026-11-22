import test from 'node:test';
import assert from 'node:assert/strict';
import { renderEffects, sampleRate } from '../sound-synth.js';
import { createCueTracker } from '../sound-cues.js';

test('every sound renders finite, audible and not clipping wildly', () => {
  for (const [name, [samples, gain]] of Object.entries(renderEffects())) {
    assert.ok(samples.length > sampleRate * 0.04, `${name} too short`);
    let peak = 0;
    for (const value of samples) {
      assert.ok(Number.isFinite(value), `${name} has a bad sample`);
      peak = Math.max(peak, Math.abs(value));
    }
    assert.ok(peak > 0.05 && peak * gain < 4, `${name} peak ${peak}`);
  }
});

test('screen changes become sound cues once each', () => {
  const tracker = createCueTracker();
  const live = { phase: 'live', flash: 0, eventText: '' };
  assert.deepEqual(tracker.cues(live, 0), []);
  assert.deepEqual(tracker.cues({ ...live, flash: 0.22 }, 16), ['hit']);
  // The server's copy of a predicted hit arrives a moment later: still one hit.
  assert.deepEqual(tracker.cues({ ...live, flash: 0 }, 32), []);
  assert.deepEqual(tracker.cues({ ...live, flash: 0.22 }, 60), []);
  assert.deepEqual(tracker.cues({ ...live, eventText: '3' }, 400), ['tick']);
  assert.deepEqual(tracker.cues({ ...live, eventText: '3' }, 416), []);
  assert.deepEqual(tracker.cues({ ...live, eventText: '2' }, 1400), ['tick']);
  assert.deepEqual(tracker.cues({ ...live, eventText: 'GUST →' }, 3400), ['gust']);
  assert.deepEqual(tracker.cues({ ...live, eventText: 'LOW NET' }, 3600), ['netDown']);
  assert.deepEqual(tracker.cues({ ...live, eventText: 'LOL' }, 3800), ['wah']);
  assert.deepEqual(tracker.cues({ ...live, eventText: 'out' }, 4000), []);
  // Points: a different sound for each side; a taunt can come with the point.
  const scored = (left, right, eventText = '') => ({ ...live, eventText, score: { left, right } });
  tracker.cues(scored(0, 0), 4100);
  assert.deepEqual(tracker.cues(scored(1, 0), 4200), ['pointWon']);
  assert.deepEqual(tracker.cues(scored(1, 1, 'Oops!'), 4300), ['wah', 'pointLost']);
  assert.deepEqual(tracker.cues(scored(1, 1), 4400), []);
  assert.deepEqual(tracker.cues(scored(1, 2), 4500, 'right'), ['pointWon']);
  assert.deepEqual(tracker.cues({ phase: 'finished', winner: 'right', flash: 0, eventText: '' }, 5000, 'right'), ['win']);
  tracker.reset();
  tracker.cues(live, 6000);
  assert.deepEqual(tracker.cues({ phase: 'finished', winner: 'right', flash: 0, eventText: '' }, 6016, 'left'), ['lose']);
});

test('the lit bomb ticks faster right before bursting and stops on OUT', () => {
  const tracker = createCueTracker();
  const lit = fuse => ({ bomb: { fuse, lit: true } });
  const beats = [];
  for (let ms = 0; ms < 2500; ms += 10) {
    if (tracker.cues(lit((2500 - ms) / 1000), ms).includes('tick')) beats.push(ms);
  }
  assert.equal(beats.length, 10);
  const gaps = beats.slice(1).map((ms, index) => ms - beats[index]);
  assert.ok(gaps.every((gap, index) => index === 0 || gap < gaps[index - 1]));
  assert.ok(gaps.at(-1) <= 60);
  assert.deepEqual(tracker.cues({ bombBurst: { age: 0 } }, 2500), ['shock']);
  tracker.cues(lit(0.41), 3100);
  assert.deepEqual(tracker.cues({ bomb: { fuse: 0.38, lit: false }, eventText: 'out' }, 3120), []);
});

test('the new effects have their own sounds', () => {
  const tracker = createCueTracker();
  const live = { phase: 'live', flash: 0, eventText: '' };
  tracker.cues(live, 0);
  // Both start with the inflating sound; the deep doong is for hitting the balloon.
  assert.deepEqual(tracker.cues({ ...live, eventText: 'BALLOON' }, 100), ['balloon']);
  assert.deepEqual(tracker.cues({ ...live, eventText: 'TRAMPOLINE' }, 200), ['balloon']);
  assert.deepEqual(tracker.cues({ ...live, effect: 'balloon', flash: 0.22 }, 250), ['doong']);
  assert.deepEqual(tracker.cues({ ...live, effect: 'balloon', flash: 0 }, 270), []);
  assert.deepEqual(tracker.cues({ ...live, flash: 0.22 }, 450), ['hit']);
  tracker.cues({ ...live, flash: 0 }, 455);
  assert.deepEqual(tracker.cues({ ...live, eventText: 'BUMPER' }, 300), ['bumperIn']);
  assert.deepEqual(tracker.cues({ ...live, eventText: 'DECOY' }, 400), ['decoyIn']);
  // The post rings at each bounce, once.
  assert.deepEqual(tracker.cues({ ...live, bumper: { ring: 1 } }, 500), ['bumper']);
  assert.deepEqual(tracker.cues({ ...live, bumper: { ring: 0.8 } }, 516), []);
  assert.deepEqual(tracker.cues({ ...live, bumper: { ring: 0 } }, 600), []);
  assert.deepEqual(tracker.cues({ ...live, bumper: { ring: 1 } }, 700), ['bumper']);
  // A burst of a fake: once, even though it stays in the view for a while.
  assert.deepEqual(tracker.cues({ ...live, pops: [{ progress: 0.02 }] }, 800), ['pop']);
  assert.deepEqual(tracker.cues({ ...live, pops: [{ progress: 0.3 }] }, 900), []);
  assert.deepEqual(tracker.cues({ ...live, pops: [{ progress: 0.9 }, { progress: 0.01 }] }, 1000), ['pop']);
  // The floor taking the shuttle: one boing, and the throw-back's ring is not also a racket hit.
  assert.deepEqual(tracker.cues({ ...live, trampoline: { swell: 1, press: { x: 200, age: 0.01 } } }, 1100), ['boing']);
  assert.deepEqual(tracker.cues({ ...live, flash: 0.22, trampoline: { swell: 0.6, press: { x: 200, age: 0.1 } } }, 1200), []);
  assert.deepEqual(tracker.cues({ ...live, trampoline: { swell: 0, press: { x: 200, age: 0.5 } } }, 1500), []);
});

test('the first shuttle plays a short cue and the second plays just the rally result', () => {
  const tracker = createCueTracker();
  const round = { phase: 'live', score: { left: 0, right: 0 }, shuttleCalls: [] };
  const mine = { winner: 'left' };
  const theirs = { winner: 'right' };
  tracker.cues(round, 0);
  assert.deepEqual(tracker.cues({ ...round, shuttleCalls: [mine] }, 16), ['shuttleWon']);
  const split = { ...round, phase: 'between', shuttleCalls: [mine, theirs] };
  assert.deepEqual(tracker.cues(split, 32), ['shuttleTie']);
  assert.deepEqual(tracker.cues(split, 48), []);

  tracker.cues(round, 64);
  assert.deepEqual(tracker.cues({ ...round, shuttleCalls: [theirs] }, 80), ['shuttleLost']);
  const loss = { ...split, score: { left: 0, right: 1 }, shuttleCalls: [theirs, theirs] };
  assert.deepEqual(tracker.cues(loss, 96), ['pointLost']);
  assert.deepEqual(tracker.cues(loss, 112), []);

  tracker.cues(round, 128);
  const win = { ...split, score: { left: 1, right: 0 }, shuttleCalls: [mine, mine] };
  assert.deepEqual(tracker.cues(win, 144), ['pointWon'], 'simultaneous calls play only the result');
  tracker.cues(round, 160);
  assert.deepEqual(tracker.cues({ ...win, phase: 'finished', winner: 'left' }, 176), ['pointWon', 'win']);
});

test('the wind bed is seamless where it loops and its two layers never line up', async () => {
  const { windAmbience } = await import('../sound-synth.js');
  const layers = windAmbience();
  assert.equal(layers.length, 2);
  assert.notEqual(layers[0].samples.length, layers[1].samples.length);
  for (const { samples } of layers) {
    let peak = 0, stepSum = 0;
    for (let i = 0; i < samples.length; i++) {
      assert.ok(Number.isFinite(samples[i]));
      peak = Math.max(peak, Math.abs(samples[i]));
      if (i) stepSum += Math.abs(samples[i] - samples[i - 1]);
    }
    const typicalStep = stepSum / (samples.length - 1);
    const seam = Math.abs(samples[0] - samples[samples.length - 1]);
    assert.ok(peak > 0.5 && peak <= 1.0001, `peak ${peak}`);
    assert.ok(seam < typicalStep * 6 + 0.02, `a click of ${seam} where it loops (typical step ${typicalStep})`);
  }
});
