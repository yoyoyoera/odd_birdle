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
