import test from 'node:test';
import assert from 'node:assert/strict';
import { backAction, matchRunning, startAppShell } from '../app-shell.js';

test('back: pause in a match, menu from the pause screen and everywhere else, exit from the menu', () => {
  const cases = [
    [{ mode: 'menu', phase: 'ready' }, 'exit'],
    [{ mode: 'solo', phase: 'starting' }, 'pause'],
    [{ mode: 'solo', phase: 'live' }, 'pause'],
    [{ mode: 'solo', phase: 'between' }, 'pause'],
    [{ mode: 'solo', phase: 'live', paused: true }, 'menu'],
    [{ mode: 'solo', phase: 'finished' }, 'menu'],
    [{ mode: 'solo', phase: 'starting', guideOpen: true }, 'menu'],
    [{ mode: 'online', phase: 'live' }, 'pause'],
    [{ mode: 'online', phase: 'live', paused: true }, 'menu'],
    [{ mode: 'online', phase: 'finished' }, 'menu'],
    [{ mode: 'waiting', phase: 'ready' }, 'menu'],
    [{ mode: 'join', phase: 'ready' }, 'menu'],
    [{ mode: 'connecting', phase: 'ready' }, 'menu']
  ];
  for (const [state, action] of cases) assert.equal(backAction(state), action, JSON.stringify(state));
  assert.equal(matchRunning({ mode: 'solo', phase: 'live' }), true);
  assert.equal(matchRunning({ mode: 'solo', phase: 'finished' }), false);
  assert.equal(matchRunning({ mode: 'menu', phase: 'ready' }), false);
});

function rig(start = { mode: 'menu', phase: 'ready', guideOpen: false }) {
  const appListeners = {};
  const docListeners = {};
  const log = [];
  const state = { ...start };
  const App = {
    addListener: (name, handler) => { appListeners[name] = handler; return Promise.resolve({ remove() {} }); },
    exitApp: () => { log.push('exit'); return Promise.resolve(); }
  };
  const doc = {
    visibilityState: 'visible',
    addEventListener: (name, handler) => { docListeners[name] = handler; }
  };
  const shell = startAppShell({
    plugins: { App }, doc, state: () => state,
    setPaused: value => log.push(value ? 'paused' : 'running'),
    toMenu: () => { log.push('menu'); state.mode = 'menu'; state.phase = 'ready'; },
    wakeAudio: () => log.push('wake'),
    sleepAudio: () => log.push('sleep')
  });
  const tapOn = (target = { closest: () => null }) => {
    const event = { target, prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    docListeners.click(event);
    return event;
  };
  return { shell, state, log, appListeners, docListeners, doc, tapOn };
}

test('the back button pauses a match, a tap resumes it, back on the pause screen goes to the menu, back there exits', () => {
  const { state, log, appListeners, tapOn } = rig({ mode: 'solo', phase: 'live' });
  assert.deepEqual(Object.keys(appListeners).sort(), ['appStateChange', 'backButton', 'pause', 'resume']);

  appListeners.backButton({ canGoBack: false });
  assert.deepEqual(log.splice(0), ['paused']);
  // The tap that resumes is used up, so it never presses the restart icon under it.
  const resumeTap = tapOn();
  assert.ok(resumeTap.prevented && resumeTap.stopped);
  assert.deepEqual(log.splice(0), ['running']);
  // Taps while playing are left alone.
  const playTap = tapOn();
  assert.ok(!playTap.prevented && !playTap.stopped);
  assert.deepEqual(log, []);

  appListeners.backButton({});
  // The sound and touch-speed buttons still work on the pause screen.
  const soundTap = tapOn({ closest: selector => (selector.includes('#studio-links') ? {} : null) });
  assert.ok(!soundTap.prevented);
  appListeners.backButton({});
  assert.deepEqual(log.splice(0), ['paused', 'menu', 'running']);
  assert.equal(state.mode, 'menu');
  appListeners.backButton({});
  assert.deepEqual(log.splice(0), ['exit']);
});

test('a finished match goes back to the menu without a pause', () => {
  const { log, appListeners } = rig({ mode: 'solo', phase: 'finished' });
  appListeners.backButton({});
  assert.deepEqual(log, ['menu', 'running']);
});

test('the app going to the background pauses a match until a tap, and wakes the sound on return', () => {
  const { log, appListeners, tapOn } = rig({ mode: 'solo', phase: 'live' });
  appListeners.appStateChange({ isActive: false });
  appListeners.pause();
  assert.deepEqual(log.splice(0), ['paused', 'sleep', 'paused', 'sleep']);
  // No tap gets through while away.
  assert.ok(!tapOn().prevented);
  appListeners.resume();
  appListeners.appStateChange({ isActive: true });
  // Still on the pause screen: the match waits for the player.
  assert.deepEqual(log.splice(0), ['paused', 'wake', 'paused', 'wake']);
  tapOn();
  assert.deepEqual(log.splice(0), ['running']);
});

test('the background on the menu pauses only while away', () => {
  const { log, appListeners, tapOn } = rig();
  appListeners.appStateChange({ isActive: false });
  appListeners.appStateChange({ isActive: true });
  assert.deepEqual(log.splice(0), ['paused', 'sleep', 'running', 'wake']);
  assert.ok(!tapOn().prevented);
});

test('a hidden page stands in for the background in a browser preview, and Escape for back', () => {
  const { log, docListeners, doc, tapOn } = rig({ mode: 'solo', phase: 'live' });
  doc.visibilityState = 'hidden';
  docListeners.visibilitychange();
  doc.visibilityState = 'visible';
  docListeners.visibilitychange();
  assert.deepEqual(log.splice(0), ['paused', 'sleep', 'paused', 'wake']);
  tapOn();
  docListeners.keydown({ key: 'Escape', target: { closest: () => null }, preventDefault() {} });
  assert.deepEqual(log.splice(0), ['running', 'paused']);
});

test('without Capacitor nothing throws', () => {
  const calls = [];
  const shell = startAppShell({ plugins: undefined, doc: undefined, state: () => ({ mode: 'menu', phase: 'ready' }),
    setPaused: value => calls.push(value), toMenu() {} });
  assert.equal(shell.back(), 'exit');
  shell.background();
  shell.foreground();
  assert.deepEqual(calls, [true, false]);
  const throwing = startAppShell({
    plugins: { App: { addListener() { throw new Error('old plugin'); }, exitApp() { return Promise.reject(new Error('no')); } } },
    doc: undefined, state: () => ({ mode: 'menu', phase: 'ready' }), setPaused() {}, toMenu() {}
  });
  assert.equal(throwing.back(), 'exit');
});
