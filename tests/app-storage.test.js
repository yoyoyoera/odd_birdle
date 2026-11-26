import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppStorage } from '../app-storage.js';

function fakePreferences(initial = {}) {
  const data = { ...initial };
  return {
    data,
    keys: async () => ({ keys: Object.keys(data) }),
    get: async ({ key }) => ({ value: data[key] ?? null }),
    set: async ({ key, value }) => { data[key] = value; },
    remove: async ({ key }) => { delete data[key]; }
  };
}

test('app storage starts with what the device kept and saves new values to it', async () => {
  const preferences = fakePreferences({ 'oddbirdle-stages:guest': '{"cleared":[1,2]}', other: 'x' });
  const storage = await createAppStorage({ preferences });
  assert.equal(storage.getItem('oddbirdle-stages:guest'), '{"cleared":[1,2]}');
  assert.equal(storage.getItem('other'), null);
  storage.setItem('oddbirdle-pad-gain', 2.2);
  assert.equal(storage.getItem('oddbirdle-pad-gain'), '2.2');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(preferences.data['oddbirdle-pad-gain'], '2.2');
  storage.removeItem('oddbirdle-pad-gain');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal('oddbirdle-pad-gain' in preferences.data, false);
});

test('a failing device store still lets the game run from memory', async () => {
  const preferences = { keys: async () => { throw new Error('down'); }, set: async () => { throw new Error('down'); }, get: async () => ({}), remove: async () => {} };
  const storage = await createAppStorage({ preferences });
  assert.equal(storage.getItem('oddbirdle-x'), null);
  storage.setItem('oddbirdle-x', 'y');
  assert.equal(storage.getItem('oddbirdle-x'), 'y');
});

test('with no Capacitor it uses the browser storage', async () => {
  const items = new Map([['oddbirdle-a', '1'], ['zzz', '2']]);
  const fallback = { get length() { return items.size; }, key: index => [...items.keys()][index], getItem: key => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value), removeItem: key => items.delete(key) };
  const storage = await createAppStorage({ preferences: undefined, fallback });
  assert.equal(storage.getItem('oddbirdle-a'), '1');
  storage.setItem('oddbirdle-b', '3');
  assert.equal(items.get('oddbirdle-b'), '3');
});
