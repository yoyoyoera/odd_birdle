import test from 'node:test';
import assert from 'node:assert/strict';
import { createEffectScript, parseEffectScript } from '../effect-script.js';
import { createCrowd } from '../crowd.js';
import { createCueTracker } from '../sound-cues.js';

test('the address names the effects, the rally and the second; without it nothing is scripted', () => {
  assert.equal(parseEffectScript(''), undefined);
  assert.equal(parseEffectScript('?effect=nonsense'), undefined);
  assert.deepEqual(parseEffectScript('?effect=invasion'), { effects: ['invasion'], rally: 1, after: 2 });
  assert.deepEqual(parseEffectScript('?effect=GUST,invasion,decoy&rally=3&after=4.5'), { effects: ['wind', 'invasion', 'decoy'], rally: 3, after: 4.5 });
});

const live = (total, extra = {}) => ({ phase: 'live', score: { left: total, right: 0 }, ...extra });

test('a scripted effect is called after its second, once it is running the next one waits for the next rally', () => {
  const script = createEffectScript({ effects: ['invasion', 'wind'], rally: 1, after: 3 });
  const called = [];
  const trigger = id => (called.push(id), true);
  for (let i = 0; i < 150; i++) script.update(live(0), 0.016, trigger);
  assert.deepEqual(called, [], 'not before 3 s');
  for (let i = 0; i < 60; i++) script.update(live(0), 0.016, trigger);
  assert.deepEqual(called, ['invasion']);
  for (let i = 0; i < 50; i++) script.update(live(0, { armed: 'invasion' }), 0.016, trigger);
  assert.deepEqual(called, ['invasion'], 'it is counting 3-2-1, not asked again');
  script.update(live(0, { effect: 'invasion' }), 0.016, trigger);
  for (let i = 0; i < 400; i++) script.update(live(0), 0.016, trigger);
  assert.deepEqual(called, ['invasion'], 'one per rally');
  for (let i = 0; i < 300; i++) script.update(live(1), 0.016, trigger);
  assert.deepEqual(called, ['invasion', 'wind']);
  assert.equal(script.pending, 1, 'the second is still counting down');
});

test('a rally that ends during the 3-2-1 does not use the effect up', () => {
  const script = createEffectScript({ effects: ['invasion'], rally: 1, after: 0 });
  const called = [];
  const trigger = id => (called.push(id), true);
  script.update(live(0), 0.016, trigger);
  script.update({ phase: 'between', score: { left: 1, right: 0 } }, 0.016, trigger);
  script.update(live(1), 0.016, trigger);
  assert.deepEqual(called, ['invasion', 'invasion'], 'tried again in the next rally');
  assert.equal(script.pending, 1);
});

test('the crowd buzzes when INVASION starts and gasps at a clash; the cue tracker plays the clash sound', () => {
  const crowd = createCrowd();
  crowd.update({ phase: 'live' }, [], 0);
  assert.ok(crowd.update({ phase: 'live', effect: 'invasion' }, [], 100).cues.includes('ooh'));
  assert.equal(crowd.update({ phase: 'live', effect: 'invasion', clash: { count: 0 } }, [], 200).cues.includes('ooh'), false);
  const clash = crowd.update({ phase: 'live', effect: 'invasion', clash: { count: 1 } }, [], 300);
  assert.ok(clash.cues.includes('ooh'));
  assert.ok(clash.mood.surprise > 0.9);
  assert.equal(crowd.update({ phase: 'live', effect: 'invasion', clash: { count: 1 } }, [], 400).cues.includes('ooh'), false, 'once per clash');
  const tracker = createCueTracker();
  tracker.cues({ phase: 'live', eventText: '' }, 0);
  assert.ok(tracker.cues({ phase: 'live', eventText: 'INVASION' }, 100).includes('invasionIn'));
  assert.ok(tracker.cues({ phase: 'live', eventText: '', clash: { count: 1 } }, 200).includes('clash'));
  assert.equal(tracker.cues({ phase: 'live', eventText: '', clash: { count: 1 } }, 300).includes('clash'), false);
});
