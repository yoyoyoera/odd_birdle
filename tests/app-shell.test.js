import test from 'node:test';
import assert from 'node:assert/strict';
import { appPlatform, backAction, matchRunning, platformRules, startAppShell } from '../app-shell.js';

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

function rig(start = { mode: 'menu', phase: 'ready', guideOpen: false }, platform = 'android') {
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
    plugins: { App }, platform, doc, state: () => state,
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
  // No Capacitor: a browser preview, which never tries to close anything.
  assert.equal(shell.platform, 'web');
  assert.equal(shell.back(), 'none');
  shell.background();
  shell.foreground();
  assert.deepEqual(calls, [true, false]);
  const throwing = startAppShell({
    plugins: { App: { addListener() { throw new Error('old plugin'); }, exitApp() { return Promise.reject(new Error('no')); } } },
    platform: 'android', doc: undefined, state: () => ({ mode: 'menu', phase: 'ready' }), setPaused() {}, toMenu() {}
  });
  assert.equal(throwing.back(), 'exit');
});

test('the platform comes from Capacitor: android, ios, or web for anything else', () => {
  assert.equal(appPlatform({ getPlatform: () => 'android' }), 'android');
  assert.equal(appPlatform({ getPlatform: () => 'ios' }), 'ios');
  assert.equal(appPlatform({ getPlatform: () => 'web' }), 'web');
  assert.equal(appPlatform({ getPlatform: () => 'electron' }), 'web');
  assert.equal(appPlatform({}), 'web');
  assert.equal(appPlatform(undefined), 'web');
  assert.equal(appPlatform({ getPlatform() { throw new Error('bridge gone'); } }), 'web');
  assert.deepEqual(platformRules('android'), { systemBack: true, canExit: true });
  assert.deepEqual(platformRules('ios'), { systemBack: false, canExit: false });
  assert.deepEqual(platformRules('web'), { systemBack: true, canExit: false });
  assert.equal(backAction({ mode: 'menu', phase: 'ready', canExit: false }), 'none');
  assert.equal(backAction({ mode: 'solo', phase: 'live', canExit: false }), 'pause');
});

test('iOS: no back button listener and never exitApp; the background pause and the sound work as on Android', () => {
  const { log, appListeners, docListeners, tapOn } = rig({ mode: 'solo', phase: 'live' }, 'ios');
  assert.deepEqual(Object.keys(appListeners).sort(), ['appStateChange', 'pause', 'resume']);
  appListeners.appStateChange({ isActive: false });
  appListeners.appStateChange({ isActive: true });
  assert.deepEqual(log.splice(0), ['paused', 'sleep', 'paused', 'wake']);
  tapOn();
  assert.deepEqual(log.splice(0), ['running']);
  // A hardware keyboard's Escape still pauses and leaves a match, but on the menu it never closes the app.
  const escape = () => docListeners.keydown({ key: 'Escape', target: { closest: () => null }, preventDefault() {} });
  escape();
  escape();
  assert.deepEqual(log.splice(0), ['paused', 'menu', 'running']);
  escape();
  escape();
  assert.deepEqual(log, []);
});

test('the app page is a game: zoom, double tap, long-press selection and the context menu are all cancelled', () => {
  const listeners = {};
  const doc = { addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); }, hidden: false };
  startAppShell({ plugins: undefined, platform: 'ios', doc, state: () => ({ mode: 'menu', phase: 'ready' }), setPaused() {}, toMenu() {} });
  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart']) {
    assert.ok(listeners[type]?.length, type + ' is listened for');
    let prevented = false;
    listeners[type][0]({ preventDefault: () => { prevented = true; } });
    assert.ok(prevented, type + ' is cancelled');
  }
});

test('release lets go of the hold a running match left behind, for an invite link that ends it', () => {
  const calls = [];
  const shell = startAppShell({
    plugins: undefined, platform: 'android', doc: undefined,
    state: () => ({ mode: 'online', phase: 'live' }), setPaused: paused => calls.push(paused), toMenu: () => {}
  });
  shell.background();
  shell.foreground();
  assert.equal(shell.held, true, 'the match stays held after coming back');
  shell.release();
  assert.equal(shell.held, false);
  assert.equal(calls.at(-1), false);
});
