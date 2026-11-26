import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../game.js';

// The phone app: after a match the card can be shared through the system share sheet.
test('app: a finished match offers SHARE CARD, which writes the card and opens the share sheet', async t => {
  let clock = 0;
  const windowEvents = {};
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
    prepend() {}
    append() {}
    replaceChildren() {}
    insertBefore() {}
    closest() { return null; }
    removeAttribute() {}
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
  globalThis.location = new URL('https://localhost/index.html');
  const calls = [];
  globalThis.Capacitor = { getPlatform: () => 'ios', Plugins: {
    Preferences: { keys: async () => ({ keys: [] }), get: async () => ({ value: null }), set: async () => {}, remove: async () => {} },
    Filesystem: { writeFile: async options => { calls.push(['write', options]); return { uri: 'file:///cache/card.png' }; } },
    Share: { share: async options => { calls.push(['share', options]); } } } };
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  globalThis.document = {
    hidden: false, visibilityState: 'visible',
    documentElement: { dataset: { portal: 'app', orientation: 'landscape', features: 'stages' }, style: { setProperty() {} } },
    querySelector: element,
    body: element('body'),
    head: element('head'),
    createElement: () => ({ width: 0, height: 0, dataset: {}, style: { setProperty() {} }, listeners: {}, hidden: false, attributes: new Map(),
      addEventListener() {}, setAttribute() {}, toggleAttribute() {}, append() {}, prepend() {}, insertBefore() {}, remove() {}, click() {}, replaceChildren() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 500 }), classList: { add() {}, remove() {} },
      getContext: () => context, toDataURL: type => `data:${type};base64,QUJD` }),
    addEventListener: (name, fn) => { (documentEvents[name] ??= []).push(fn); }
  };
  globalThis.window = {
    Capacitor: globalThis.Capacitor, innerWidth: 915, innerHeight: 412,
    matchMedia: () => ({ matches: false }),
    addEventListener: (name, fn) => { (windowEvents[name] ??= []).push(fn); }
  };
  globalThis.devicePixelRatio = 1;
  globalThis.innerWidth = 915;
  globalThis.innerHeight = 412;
  globalThis.WebSocket = Socket;
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.requestAnimationFrame = fn => { if (fn.name === 'frame') nextFrame = fn; };
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

  storage.delete('oddbirdle-guide-screen');
  element('#guide').hidden = true;
  await element('#cpu').click();
  await new Promise(resolve => setImmediate(resolve));
  // The first game on an app opens the how-to guide: skip it.
  await element('#guide-skip').click();
  frames(5);
  playUntilFinished();
  frames(3);
  const card = element('#card-button');
  assert.equal(card.hidden, false, 'the card button shows after a finished match');
  assert.equal(element('#card-label').textContent, 'SHARE CARD');
  await card.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls[0][0], 'write');
  assert.equal(calls[0][1].directory, 'CACHE');
  assert.equal(calls[1][0], 'share');
  assert.deepEqual(calls[1][1].files, ['file:///cache/card.png']);
  assert.match(calls[1][1].text, /^FULL-TIME \d+:\d+ vs CPU Lv\.\d/);
  assert.equal(element('#card-label').textContent, 'SHARE CARD', 'it can be shared again');
  assert.equal(card.disabled, false);
});
