import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameMeter } from '../frame-meter.js';

test('distinguishes a 30 Hz callback with cheap work from expensive game frames', () => {
  const meter = createFrameMeter();
  for (let i = 0; i < 100; i++) meter.record(i * 1000 / 30, 2);
  assert.ok(Math.abs(meter.summary().fps - 30) < 0.01);
  assert.equal(meter.summary().workP95, 2);
  assert.ok(Math.abs(meter.summary().gapP95 - 1000 / 30) < 0.01);
  meter.reset();
  assert.equal(meter.summary(), undefined);
  for (let i = 0; i < 100; i++) meter.record(i * 1000 / 60, 14);
  assert.ok(Math.abs(meter.summary().fps - 60) < 0.01);
  assert.equal(meter.summary().workP95, 14);
});

test('ignores suspended tabs and reports recent rather than lifetime cadence', () => {
  const meter = createFrameMeter();
  let time = 0;
  for (let i = 0; i < 200; i++) meter.record(time += 1000 / 30, 2);
  meter.record(time += 5000, 300);
  for (let i = 0; i < 200; i++) meter.record(time += 1000 / 60, 1);
  assert.ok(Math.abs(meter.summary().fps - 60) < 0.01);
  assert.equal(meter.summary().workP95, 1);
});
