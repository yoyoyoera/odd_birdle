import test from 'node:test';
import assert from 'node:assert/strict';

// sound.js in a page with a fake Web Audio context whose state the test sets (Safari's 'interrupted' after a call).
const docListeners = {};
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = {
  visibilityState: 'visible',
  addEventListener: (name, handler) => { docListeners[name] = handler; }
};
const contexts = [];
class FakeContext {
  state = 'suspended';
  currentTime = 0;
  destination = {};
  calls = [];
  constructor() { contexts.push(this); }
  resume() {
    this.calls.push('resume');
    // iOS refuses while the call is still on.
    if (this.state === 'interrupted' && this.refuse) return Promise.reject(new Error('interrupted'));
    if (this.state !== 'closed') this.state = 'running';
    return Promise.resolve();
  }
  suspend() { this.calls.push('suspend'); this.state = 'suspended'; return Promise.resolve(); }
  createWaveShaper() { return { connect: next => next }; }
  createGain() { return { gain: { value: 1, setTargetAtTime() {} }, connect: next => next }; }
  createBuffer() { return { copyToChannel() {} }; }
  createBufferSource() { return { playbackRate: {}, connect: next => next, start() {} }; }
}
globalThis.window = { AudioContext: FakeContext };
const { canResume, createSound } = await import('../sound.js');

test('only a suspended or interrupted context is resumed', () => {
  assert.equal(canResume('suspended'), true);
  assert.equal(canResume('interrupted'), true);
  assert.equal(canResume('running'), false);
  assert.equal(canResume('closed'), false);
  assert.equal(canResume(undefined), false);
});

test('wake() and the first touch after a call or the background start the sound again', async () => {
  const sound = createSound();
  // Nothing exists before the first tap.
  sound.wake();
  assert.equal(contexts.length, 0);
  sound.unlock();
  const context = contexts[0];
  assert.equal(context.state, 'running');
  context.calls.length = 0;
  // Already running: a tap costs nothing.
  sound.unlock();
  sound.wake();
  assert.deepEqual(context.calls, []);

  // A phone call on iOS: 'interrupted'. Coming back (app-shell's foreground) resumes it.
  context.state = 'interrupted';
  sound.wake();
  assert.equal(context.state, 'running');
  // Still interrupted when the app returns: the refusal is swallowed, and the first touch tries again.
  context.state = 'interrupted';
  context.refuse = true;
  sound.wake();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(context.state, 'interrupted');
  context.refuse = false;
  sound.unlock();
  assert.equal(context.state, 'running');

  // The background (app-shell's sleep), then back.
  sound.sleep();
  assert.equal(context.state, 'suspended');
  sound.wake();
  assert.equal(context.state, 'running');
  // A hidden tab goes quiet and comes back, as before.
  globalThis.document.visibilityState = 'hidden';
  docListeners.visibilitychange();
  assert.equal(context.state, 'suspended');
  // A tap while hidden does not start it.
  sound.unlock();
  assert.equal(context.state, 'suspended');
  globalThis.document.visibilityState = 'visible';
  docListeners.visibilitychange();
  assert.equal(context.state, 'running');
  // A closed context is left alone.
  context.state = 'closed';
  context.calls.length = 0;
  sound.wake();
  sound.unlock();
  assert.deepEqual(context.calls, []);
});
