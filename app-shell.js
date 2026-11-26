// The app only (<html data-portal="app">, loaded by client.js), Android and iOS: the system back button and the app going
// to the background, through Capacitor's App plugin (window.Capacitor.Plugins.App, no bundler). Every call is guarded, so
// in a normal browser preview the page still works: there the tab being hidden stands in for the app going away, and
// Escape for the back button.

// 'android' | 'ios' | 'web' (a browser preview, or anything Capacitor does not name).
export function appPlatform(capacitor = globalThis.window?.Capacitor) {
  try {
    const platform = capacitor?.getPlatform?.();
    return platform === 'android' || platform === 'ios' ? platform : 'web';
  } catch {
    return 'web';
  }
}

// What each platform allows:
//   systemBack: Android's back button (gesture) is listened to. An iPhone has none; there the ← on the court is the way
//               to the menu, and the pause after the background ends with a tap.
//   canExit:    App.exitApp is Android only. An iOS app must never close itself (App Store rule), so back on the main
//               menu (Escape from a hardware keyboard) does nothing there.
export function platformRules(platform) {
  return { systemBack: platform !== 'ios', canExit: platform === 'android' };
}

// A CPU or online match that has not ended yet (the guide before the first countdown counts: it is part of the match).
export function matchRunning({ mode, phase }) {
  return (mode === 'solo' || mode === 'online') && phase !== 'finished';
}

// What the back button does on each screen:
//   in a match            -> 'pause'  (the game's own pause screen)
//   on the pause screen   -> 'menu'   (leave the match; a tap anywhere resumes instead)
//   the first-play guide  -> 'menu'   (it opens just before a match, so back leaves that match)
//   a finished match      -> 'menu'   (the same as its MENU button)
//   rooms, codes, connecting (online builds) -> 'menu'
//   the main menu         -> 'exit' (Android), 'none' where the app may not close itself (iOS, a browser preview)
export function backAction({ mode, phase, paused = false, guideOpen = false, canExit = true }) {
  if (mode === 'menu') return canExit ? 'exit' : 'none';
  if (guideOpen) return 'menu';
  if (matchRunning({ mode, phase })) return paused ? 'menu' : 'pause';
  return 'menu';
}

// Buttons that still do their own job on the pause screen instead of resuming: sound, touch speed.
const keepTargets = '#studio-links, #touch-tune';

export function startAppShell({
  plugins = globalThis.window?.Capacitor?.Plugins,
  platform = appPlatform(),
  doc = globalThis.document,
  state,
  setPaused,
  toMenu,
  wakeAudio = () => {},
  sleepAudio = () => {}
}) {
  const app = plugins?.App;
  const rules = platformRules(platform);
  // A game, not a page: no pinch or double-tap zoom, no text selection or magnifier from a long press, no context menu.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart']) {
    doc?.addEventListener?.(type, event => event.preventDefault(), { passive: false });
  }
  let away = false;   // the app is in the background (or the tab hidden)
  let held = false;   // the player's pause: stays until a tap, or back to the menu

  const apply = () => {
    try { setPaused(away || held); } catch { /* the game decides */ }
  };

  function back() {
    const action = backAction({ ...state(), paused: held, canExit: rules.canExit });
    if (action === 'pause') {
      held = true;
      apply();
    } else if (action === 'menu') {
      toMenu();
      held = false;
      apply();
    } else if (action === 'exit' && rules.canExit) {
      try { Promise.resolve(app?.exitApp?.()).catch(() => {}); } catch { /* not in the app */ }
    }
    return action;
  }

  function background() {
    if (!away && matchRunning(state())) held = true;
    away = true;
    apply();
    try { sleepAudio(); } catch { /* no sound */ }
  }

  function foreground() {
    away = false;
    apply();
    // WebView may not fire visibilitychange on return, so the sound is woken here too.
    try { wakeAudio(); } catch { /* no sound */ }
  }

  // A tap anywhere (but on the sound or touch-speed controls) ends the player's pause. It is used up here, so it never
  // also presses the button under it (the restart icon, PLAY AGAIN).
  function tap(event) {
    if (!held || away) return false;
    if (event?.target?.closest?.(keepTargets)) return false;
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    held = false;
    apply();
    return true;
  }

  const listen = (name, handler) => {
    try {
      const handle = app?.addListener?.(name, handler);
      Promise.resolve(handle).catch(() => {});
    } catch {
      // Not in the app, or an older plugin.
    }
  };
  if (rules.systemBack) listen('backButton', () => back());
  listen('appStateChange', change => (change?.isActive === false ? background() : foreground()));
  listen('pause', () => background());
  listen('resume', () => foreground());

  doc?.addEventListener?.('visibilitychange', () => (doc.visibilityState === 'hidden' ? background() : foreground()));
  doc?.addEventListener?.('click', tap, { capture: true });
  doc?.addEventListener?.('keydown', event => {
    if (event.key !== 'Escape' || event.repeat || event.target?.closest?.('input, textarea')) return;
    event.preventDefault?.();
    back();
  });

  // An invite link opened the game: whatever was being played is over, so the hold the player's pause left must not stay.
  function release() {
    held = false;
    apply();
  }

  return { back, background, foreground, tap, release, platform, get held() { return held; }, get away() { return away; } };
}
