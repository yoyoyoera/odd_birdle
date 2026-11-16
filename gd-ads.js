// GD events are also queued by the page before the game module has loaded.
// Keep the SDK boundary testable without requesting real advertisements.
export function createGdAds({ getSdk, pause, showContinue, timeoutMs = 120000 }) {
  let pending;
  let finish;
  let shown = false;
  let resuming = false;

  async function complete() {
    if (!finish || resuming) return;
    resuming = true;
    // An actual advertisement returns to a player-controlled screen.
    if (shown) await showContinue();
    pause(false);
    const resolve = finish;
    finish = undefined;
    pending = undefined;
    resolve();
  }

  function event(event) {
    if (event.name === 'SDK_GAME_PAUSE') {
      shown = true;
      pause(true);
    } else if (event.name === 'SDK_GAME_START' || event.name === 'SDK_ERROR' || event.name === 'AD_ERROR') {
      if (finish) void complete();
      else pause(false);
    }
  }

  function request() {
    if (pending) return pending;
    const sdk = getSdk();
    if (typeof sdk?.showAd !== 'function') return Promise.resolve();
    shown = false;
    resuming = false;
    let timer;
    pending = new Promise(resolve => { finish = () => { clearTimeout(timer); resolve(); }; });
    const result = pending;
    pause(true);
    timer = setTimeout(() => void complete(), timeoutMs);
    try {
      // Call directly from the click handler, before awaiting anything, for mobile user activation.
      const request = sdk.showAd();
      // Current SDKs return a promise; older integrations finish through the SDK events.
      if (request?.then) request.then(() => void complete(), () => void complete());
    } catch {
      void complete();
    }
    return result;
  }

  return { event, request };
}

export function showGdContinue() {
  return new Promise(resolve => {
    const cover = document.createElement('div');
    cover.style.cssText = 'position:fixed;inset:0;z-index:10000;display:grid;place-items:center;background:var(--page);color:var(--court)';
    const button = document.createElement('button');
    button.textContent = 'CONTINUE';
    button.style.cssText = 'font:650 1.5rem "Space Grotesk",sans-serif;padding:16px 24px;border:1px solid currentColor;background:none;color:inherit;cursor:pointer';
    button.addEventListener('click', () => { cover.remove(); resolve(); }, { once: true });
    cover.append(button);
    document.body.append(cover);
    button.focus();
  });
}
