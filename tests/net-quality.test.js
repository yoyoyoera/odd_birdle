import test from 'node:test';
import assert from 'node:assert/strict';
import { createNetMeter } from '../net-quality.js';

function playMatch(meter, { ping, late, fps, seconds = 30 }) {
  meter.begin();
  let now = 0;
  const gap = 1000 / fps;
  for (let t = 0; t < seconds * 1000; t += gap) {
    now += gap;
    meter.frame(now);
    if (Math.round(t) % 2000 < gap) { meter.rtt(ping); meter.late(late); }
  }
}

test('a wired player lands in the best buckets', () => {
  const meter = createNetMeter();
  playMatch(meter, { ping: 20, late: 8, fps: 60 });
  assert.deepEqual(meter.summary({ guessedPct: 0.2, touch: false, link: undefined }), {
    name: 'net_quality', ping: '<50', late: '<30', guess: '<1', fps: '45+', input: 'mouse', link: 'unknown'
  });
});

test('a phone on mobile data lands in the worse buckets, with the link type', () => {
  const meter = createNetMeter();
  playMatch(meter, { ping: 140, late: 110, fps: 30 });
  assert.deepEqual(meter.summary({ guessedPct: 6, touch: true, link: '4g' }), {
    name: 'net_quality', ping: '100-200', late: '80-150', guess: '3-10', fps: '25-45', input: 'touch', link: '4g'
  });
});

test('bucket edges: just under and at the limit', () => {
  const meter = createNetMeter();
  playMatch(meter, { ping: 49, late: 29, fps: 60 });
  assert.equal(meter.summary({}).ping, '<50');
  playMatch(meter, { ping: 50, late: 30, fps: 60 });
  assert.equal(meter.summary({}).ping, '50-100');
  assert.equal(meter.summary({}).late, '30-80');
});

test('short matches, matches without pings, and finished ones report nothing', () => {
  const meter = createNetMeter();
  playMatch(meter, { ping: 20, late: 8, fps: 60, seconds: 8 });
  assert.equal(meter.summary({}), undefined, 'under 15 seconds');
  meter.begin();
  for (let now = 0; now < 30000; now += 16) meter.frame(now);
  assert.equal(meter.summary({}), undefined, 'no ping or lateness data');
  playMatch(meter, { ping: 20, late: 8, fps: 60 });
  assert.ok(meter.summary({}));
  meter.end();
  assert.equal(meter.summary({}), undefined, 'reported once: nothing after the match ended');
});

test('a backgrounded tab does not count as slow frames, and bad numbers are ignored', () => {
  const meter = createNetMeter();
  meter.begin();
  let now = 0;
  for (let i = 0; i < 600; i++) { now += 16.7; meter.frame(now); }
  now += 20000; // tab in the background
  for (let i = 0; i < 600; i++) { now += 16.7; meter.frame(now); }
  for (const value of [NaN, -5, Infinity, undefined]) { meter.rtt(value); meter.late(value); }
  for (let i = 0; i < 4; i++) { meter.rtt(30); meter.late(10); }
  assert.equal(meter.summary({}).fps, '45+');
});

test('the readings are anonymous: only buckets and two labels are reported', () => {
  const meter = createNetMeter();
  playMatch(meter, { ping: 90, late: 40, fps: 60 });
  const summary = meter.summary({ guessedPct: 2, touch: true, link: 'wifi' });
  assert.deepEqual(Object.keys(summary).sort(), ['fps', 'guess', 'input', 'late', 'link', 'name', 'ping']);
  assert.equal(summary.link, 'unknown', 'only known link types are passed on');
});
