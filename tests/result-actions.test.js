import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../game.js';

// Y8 rejected a build that looked stuck after a lost match: the only way on was a small icon on the net.
// After every finished match (lost or won, CPU, QUICK MATCH or online) there must be worded buttons that work.
test('after a match there are buttons (and keys) to play again or go back to the menu', async t => {
  let clock = 0;
  let nextFrame;
  let paints = 0;
  const elements = new Map();
  const documentEvents = {};
  const sdkEvents = {};
  const sockets = [];
  class Element {
    constructor(id) { this.id = id; }
    listeners = {};
    dataset = {};
    style = { setProperty() {} };
    textContent = '';
    value = '';
    hidden = false;
    attributes = new Map();
    addEventListener(name, fn, capture) { (this.listeners[name] ??= []).push({ fn, capture }); }
    setAttribute(name, value) { this.attributes.set(name, value); }
    toggleAttribute(name, on) { if (on) this.attributes.set(name, ''); else this.attributes.delete(name); }
    getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 500 }; }
    querySelector(name) { return element(this.id + ' ' + name); }
    blur() {}
    focus() {}
    remove() {}
    async click() {
      let cancelled = false;
      const event = { preventDefault() { cancelled = true; }, stopImmediatePropagation() {} };
      for (const listener of element('#stage').listeners.click ?? []) if (listener.capture) listener.fn(event);
      if (!cancelled) for (const listener of this.listeners.click ?? []) await listener.fn(event);
    }
  }
  const element = id => {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  };
  const context = new Proxy({}, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === 'fillRect') return () => { paints++; };
      if (name === 'measureText') return () => ({ width: 50 });
      if (name === 'createLinearGradient') return () => ({ addColorStop() {} });
      return () => {};
    }
  });
  element('#court').getContext = () => context;
  class Socket {
    static OPEN = 1;
    constructor() { sockets.push(this); }
    readyState = 0;
    listeners = {};
    sent = [];
    addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn); }
    emit(name, event = {}) { for (const fn of this.listeners[name] ?? []) fn(event); }
    open() { this.readyState = 1; this.emit('open'); }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    receive(message) { this.emit('message', { data: JSON.stringify(message) }); }
    close() { this.readyState = 3; this.emit('close'); }
  }
  const storage = new Map([['oddbirdle-hint-done', '1']]);
  t.mock.method(performance, 'now', () => clock);
  t.mock.method(globalThis, 'setInterval', () => 1);
  globalThis.location = new URL('https://item-cdn.y8.com/test/index.html');
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  globalThis.document = {
    hidden: false, visibilityState: 'visible',
    documentElement: { dataset: { portal: 'y8' }, style: { setProperty() {} } },
    querySelector: element,
    addEventListener: (name, fn) => { (documentEvents[name] ??= []).push(fn); }
  };
  globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener() {}
  };
  globalThis.devicePixelRatio = 1;
  globalThis.WebSocket = Socket;
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.requestAnimationFrame = fn => { nextFrame = fn; };
  await import('../client.js');
  await new Promise(resolve => setImmediate(resolve));
  const frames = (count = 1) => {
    for (let i = 0; i < count; i++) { clock += 16; nextFrame(clock); }
  };
  const stage = element('#stage');
  const actions = element('#result-actions');
  // The CPU wins every point while nobody moves; the match ends within a couple of minutes of game time.
  const playUntilFinished = () => {
    for (let i = 0; i < 20000 && stage.dataset.phase !== 'finished'; i++) frames();
    assert.equal(stage.dataset.phase, 'finished');
  };
  const press = key => { for (const fn of documentEvents.keydown ?? []) fn({ key, target: {}, preventDefault() {} }); };

  // CPU, lost: PLAY AGAIN starts a fresh match.
  await element('#cpu').click();
  frames(5);
  assert.equal(actions.hidden, true, 'no result buttons during a match');
  playUntilFinished();
  assert.equal(element('#winner').textContent, 'You Lose..');
  assert.equal(actions.hidden, false);
  assert.equal(element('#play-again').hidden, false);
  assert.equal(element('#play-again').textContent, 'PLAY AGAIN');
  assert.equal(element('#game-control').hidden, true, 'the small icon gives way to the words');
  await element('#play-again').click();
  await new Promise(resolve => setImmediate(resolve));
  frames();
  assert.notEqual(stage.dataset.phase, 'finished');
  assert.equal(element('#score').value, '0:0');
  assert.equal(actions.hidden, true);

  // CPU, lost again: Enter plays again too.
  playUntilFinished();
  press('Enter');
  await new Promise(resolve => setImmediate(resolve));
  frames();
  assert.equal(element('#score').value, '0:0', 'Enter plays again');

  // MENU goes back to the main menu.
  playUntilFinished();
  await element('#to-menu').click();
  frames();
  assert.equal(element('#menu').hidden, false);
  assert.equal(actions.hidden, true);

  // QUICK MATCH: the CPU game played while waiting ends the same way and does not hang on an opponent.
  await element('#quick').click();
  await new Promise(resolve => setImmediate(resolve));
  const queue = sockets.at(-1);
  queue.open();
  playUntilFinished();
  assert.equal(actions.hidden, false);
  await element('#play-again').click();
  await new Promise(resolve => setImmediate(resolve));
  frames();
  assert.equal(element('#score').value, '0:0', 'quick match CPU game restarts');
  playUntilFinished();
  await element('#to-menu').click();
  frames();
  assert.equal(element('#menu').hidden, false);
  assert.equal(queue.readyState, 3, 'leaving to the menu stops looking for a player');

  // Online, won and lost: REMATCH sends the restart and waits; MENU leaves.
  for (const winner of ['right', 'left']) {
    await element('#create').click();
    const room = sockets.at(-1);
    room.open();
    const serverGame = createGame();
    serverGame.restart(3);
    room.receive({ type: 'start', side: 'right', round: 1, time: 1000, state: serverGame.view() });
    frames();
    const over = { ...serverGame.view(), phase: 'finished', winner, score: { left: 2, right: 5 }, eventText: '' };
    room.receive({ type: 'state', time: 9000, state: over });
    frames(30);
    assert.equal(element('#winner').textContent, winner === 'right' ? 'You Win!' : 'You Lose..');
    assert.equal(actions.hidden, false);
    assert.equal(element('#play-again').textContent, 'REMATCH');
    await element('#play-again').click();
    await new Promise(resolve => setImmediate(resolve));
    frames();
    assert.ok(room.sent.some(m => m.type === 'restart'), 'rematch asked for');
    assert.equal(element('#play-again').hidden, true, 'waiting for the other player');
    assert.equal(actions.hidden, false, 'MENU stays available while waiting');
    await element('#to-menu').click();
    frames();
    assert.equal(element('#menu').hidden, false);
    assert.equal(room.readyState, 3);
  }

  // CPU sides: each match puts the player on a random half, flagged YOU, with the CPU label on the other half.
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    await element('#cpu').click();
    await new Promise(resolve => setImmediate(resolve));
    frames();
    const side = element('#side-label').dataset.side;
    seen.add(side);
    assert.equal(element('#you-flag').dataset.side, side);
    assert.equal(element('#you-flag').hidden, false);
    assert.notEqual(element('#cpu-label').dataset.side, side);
    await element('#back').click();
  }
  assert.deepEqual([...seen].sort(), ['left', 'right']);

  // Online: the YOU flag follows the side the server gives, which changes on a rematch.
  await element('#create').click();
  const ends = sockets.at(-1);
  ends.open();
  const endsGame = createGame();
  endsGame.restart(3);
  ends.receive({ type: 'start', side: 'left', round: 1, time: 1000, state: endsGame.view() });
  frames();
  assert.equal(element('#you-flag').dataset.side, 'left');
  ends.receive({ type: 'start', side: 'right', round: 2, time: 2000, state: endsGame.view() });
  frames();
  assert.equal(element('#you-flag').dataset.side, 'right');
  assert.equal(element('#side-label').dataset.side, 'right');
});
