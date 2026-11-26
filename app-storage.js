// Where the phone app keeps what must survive: the stages cleared and the touch speed.
// In the app: Capacitor's Preferences (Android SharedPreferences, iOS UserDefaults); an iPhone's WebView may clear its
// localStorage when it is short of space, so the app never relies on that. In a browser preview: localStorage.
// The game reads keys in one go, so it is given a plain getItem/setItem that is already filled in (`ready`), and every
// write goes to memory first and to the device right after.
export const appKeyPrefix = 'oddbirdle-';

export async function createAppStorage({ preferences = globalThis.Capacitor?.Plugins?.Preferences, fallback } = {}) {
  const memory = new Map();
  const local = fallback ?? (() => {
    try { return globalThis.localStorage; } catch { return undefined; }
  })();
  if (preferences) {
    try {
      const { keys } = await preferences.keys();
      await Promise.all(keys.filter(key => key.startsWith(appKeyPrefix)).map(async key => {
        const { value } = await preferences.get({ key });
        if (typeof value === 'string') memory.set(key, value);
      }));
    } catch { /* an empty start is better than none */ }
  } else if (local) {
    for (let index = 0; index < local.length; index++) {
      const key = local.key(index);
      if (key?.startsWith(appKeyPrefix)) memory.set(key, local.getItem(key));
    }
  }
  return {
    getItem: key => memory.has(key) ? memory.get(key) : null,
    setItem(key, value) {
      memory.set(key, String(value));
      try {
        if (preferences) preferences.set({ key, value: String(value) }).catch(() => {});
        else local?.setItem(key, String(value));
      } catch { /* kept in memory until the app closes */ }
    },
    removeItem(key) {
      memory.delete(key);
      try {
        if (preferences) preferences.remove({ key }).catch(() => {});
        else local?.removeItem(key);
      } catch { /* gone from memory anyway */ }
    }
  };
}
