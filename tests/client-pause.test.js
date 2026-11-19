import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../game.js';

test('real client pauses CPU/search, rejects a late match, and resumes online from current server state', async t => {
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
  globalThis.location = new URL('https://h5.gamepix.com/test/index.html');
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  globalThis.document = {
    hidden: false, visibilityState: 'visible',
    documentElement: { dataset: { portal: 'gamepix' }, style: { setProperty() {} } },
    querySelector: element,
    addEventListener: (name, fn) => { (documentEvents[name] ??= []).push(fn); }
  };
  globalThis.window = {
    matchMedia: () => ({ matches: false }),
    GamePix: {
      events: { on: (name, fn) => { sdkEvents[name] = fn; } },
      lifecycle: { loading() {}, loaded: async () => ({}), gameStart() {} },
      ads: { interstitial: async () => ({ success: false }) }
    }
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
  const notice = () => element('#pause-overlay');
  const title = () => element('#pause-title').textContent;

  await element('#cpu').click();
  frames(210);
  assert.equal(element('#stage').dataset.phase, 'live');
  sdkEvents.pause();
  const before = paints;
  frames(250);
  assert.equal(paints, before, 'CPU scene does not advance or draw while paused');
  assert.equal(notice().hidden, false);
  assert.equal(title(), 'PAUSED');
  assert.equal(sockets.length, 0);
  sdkEvents.resume();
  frames();
  assert.equal(element('#stage').dataset.phase, 'live', 'CPU resumes the same game instead of restarting');
  assert.ok(paints > before);
  assert.equal(notice().hidden, true);

  await element('#back').click();
  await element('#quick').click();
  const queued = sockets.at(-1);
  queued.open();
  queued.receive({ type: 'queued' });
  frames();
  assert.ok(queued.sent.some(m => m.type === 'queue'));
  sdkEvents.pause();
  assert.equal(queued.readyState, 3, 'pause closes the queue connection to cancel pending seating');
  assert.match(element('#pause-detail').textContent, /CPU game and matchmaking are paused/);
  const serverGame = createGame();
  serverGame.restart(3);
  queued.receive({ type: 'start', side: 'right', round: 1, time: 1000, state: serverGame.view() });
  frames(200);
  assert.equal(title(), 'PAUSED', 'a late start from the retired socket cannot replace the CPU game');
  assert.equal(sockets.length, 1, 'there is no background reconnect during pause');
  sdkEvents.resume();
  const matched = sockets.at(-1);
  assert.notEqual(matched, queued);
  matched.open();
  assert.ok(matched.sent.some(m => m.type === 'queue'), 'resume re-enters matchmaking immediately');
  matched.receive({ type: 'start', side: 'right', round: 1, time: 2000, state: serverGame.view() });
  frames();
  assert.equal(element('#side-label').dataset.side, 'right');
  assert.equal(element('#game-control').hidden, true, 'there is no mid-game online restart');

  sdkEvents.pause();
  const onlinePaints = paints;
  const originalScore = element('#score').value;
  assert.equal(title(), 'ONLINE MATCHES CANNOT BE PAUSED');
  assert.match(element('#pause-detail').textContent, /match continues/);
  assert.equal(matched.readyState, 1, 'an ongoing match stays connected');
  assert.ok(matched.sent.some(m => m.type === 'racket' && m.input === null));
  const latest = { ...serverGame.view(), phase: 'finished', winner: 'left', score: { left: 5, right: 2 }, eventText: '' };
  matched.receive({ type: 'state', time: 9000, state: latest });
  frames(400);
  assert.equal(paints, onlinePaints, 'only the local scene is frozen while server state arrives');
  assert.equal(element('#score').value, originalScore);
  assert.ok(!matched.sent.some(m => m.type === 'pause' || m.type === 'restart'));
  await element('#play-again').click();
  assert.ok(!matched.sent.some(m => m.type === 'restart'), 'pause cannot trigger a restart');
  sdkEvents.resume();
  frames();
  assert.equal(notice().hidden, true);
  assert.equal(element('#score').value, '5:2', 'resume immediately shows the latest authoritative score');
  assert.equal(element('#stage').dataset.phase, 'finished');
  assert.equal(element('#result-actions').hidden, false, 'worded buttons after an online match');
  assert.equal(element('#play-again').textContent, 'REMATCH');
  assert.equal(element('#game-control').hidden, true);
  await element('#back').click();
  matched.receive({ type: 'state', time: 10000, state: latest });
  assert.equal(element('#menu').hidden, false, 'late packets after leaving do not revive a match');
});
