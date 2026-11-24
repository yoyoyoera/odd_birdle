// The Android app only (<html data-portal="app">, loaded by client.js): the system back button and the app going to the
// background, through Capacitor's App plugin (window.Capacitor.Plugins.App, no bundler). Every call is guarded, so in a
// normal browser preview the page still works: there the tab being hidden stands in for the app going away, and Escape
// for the back button.

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
//   the main menu         -> 'exit'
export function backAction({ mode, phase, paused = false, guideOpen = false }) {
  if (mode === 'menu') return 'exit';
  if (guideOpen) return 'menu';
  if (matchRunning({ mode, phase })) return paused ? 'menu' : 'pause';
  return 'menu';
}

// Buttons that still do their own job on the pause screen instead of resuming: sound, touch speed.
const keepTargets = '#studio-links, #touch-tune';

export function startAppShell({
  plugins = globalThis.window?.Capacitor?.Plugins,
  doc = globalThis.document,
  state,
  setPaused,
  toMenu,
  wakeAudio = () => {},
  sleepAudio = () => {}
}) {
  const app = plugins?.App;
  let away = false;   // the app is in the background (or the tab hidden)
  let held = false;   // the player's pause: stays until a tap, or back to the menu

  const apply = () => {
    try { setPaused(away || held); } catch { /* the game decides */ }
  };

  function back() {
    const action = backAction({ ...state(), paused: held });
    if (action === 'pause') {
      held = true;
      apply();
    } else if (action === 'menu') {
      toMenu();
      held = false;
      apply();
    } else if (action === 'exit') {
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
  listen('backButton', () => back());
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

  return { back, background, foreground, tap, get held() { return held; }, get away() { return away; } };
}
