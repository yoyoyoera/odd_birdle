import { validClears } from './stages.js';

// The server owns confirmed clears; only explicitly unsaved wins are restored from a device.
// A guest's device record is never imported into a Reddit account.
export function createStageProgress({ storage, identity = Promise.resolve(''), request = fetch, onChange = () => {} } = {}) {
  let cleared = [], pending = [], synced = [], userId = '', online = false;
  let queue = Promise.resolve();
  const key = () => 'oddbirdle-stages:' + (userId || 'guest');
  function cached() {
    try {
      const value = JSON.parse(storage?.getItem(key()) ?? '{}');
      return { cleared: validClears(value?.cleared), pending: validClears(value?.pending) };
    } catch { return { cleared: [], pending: [] }; }
  }
  function save() {
    try { storage?.setItem(key(), JSON.stringify({ cleared, pending })); } catch { /* Memory is enough for this visit. */ }
    onChange([...cleared], online);
  }
  async function api(options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await request('/api/stages', { ...options, signal: controller.signal });
      if (!response.ok) throw new Error('Progress unavailable');
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  async function sync() {
    for (const stage of validClears(pending).filter(id => !synced.includes(id))) {
      const result = await api({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stage }) });
      if (result.userId !== userId) throw new Error('Progress identity changed');
      synced = validClears(result.cleared);
      pending = pending.filter(id => !synced.includes(id));
      cleared = validClears([...synced, ...pending]);
      save();
    }
    online = true;
    save();
  }
  const ready = (async () => {
    try { userId = await identity || ''; } catch { /* Static preview or guest. */ }
    const backup = cached();
    cleared = backup.cleared;
    pending = backup.pending;
    save();
    try {
      const result = await api();
      if (typeof result.userId !== 'string' || !result.userId) return;
      userId = result.userId;
      const account = cached();
      synced = validClears(result.cleared);
      pending = account.pending.filter(id => !synced.includes(id));
      cleared = validClears([...synced, ...pending]);
      online = true;
      save();
      await sync();
    } catch { online = false; save(); }
  })();
  return {
    ready,
    get cleared() { return [...cleared]; },
    record(stage) {
      // Serialize writes so bonus21 always follows pending clears1–20.
      queue = queue.then(() => ready).then(async () => {
        cleared = validClears([...cleared, stage]);
        if (!synced.includes(stage)) pending = validClears([...pending, stage]);
        save();
        if (!userId) return;
        try { await sync(); } catch { online = false; save(); }
      });
      return queue;
    }
  };
}
