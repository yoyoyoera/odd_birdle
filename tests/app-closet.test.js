import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloset, closetKey } from '../app-closet.js';

const memory = () => { const items = new Map(); return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)), items }; };

test('a new closet starts with the starting rackets and coins and the plain racket in hand', () => {
  const closet = createCloset(memory());
  assert.deepEqual(closet.owned, ['classic', 'long', 'wide', 'block']);
  assert.equal(closet.equipped, 'classic');
  assert.equal(closet.coins, 340);
  assert.equal(closet.shape, undefined, 'the plain racket is no shape');
});

test('only an owned racket can be held, and the choice is remembered', () => {
  const storage = memory();
  const closet = createCloset(storage);
  assert.equal(closet.equip('peanut'), false);
  assert.equal(closet.equip('nonsense'), false);
  assert.equal(closet.equip('wide'), true);
  assert.equal(closet.shape.id, 'wide');
  const again = createCloset(storage);
  assert.equal(again.equipped, 'wide');
});

test('buying takes coins once, and only what is for sale and not yet owned', () => {
  const storage = memory();
  const closet = createCloset(storage);
  assert.deepEqual(closet.buy('peanut'), { ok: true });
  assert.equal(closet.coins, 340 - 150);
  assert.ok(closet.has('peanut'));
  assert.equal(closet.buy('peanut').reason, 'owned');
  assert.equal(closet.buy('classic').reason, 'unknown', 'the plain racket is not for sale');
  assert.equal(closet.buy('nonsense').reason, 'unknown');
  assert.equal(closet.buy('twin').ok, true);
  assert.equal(closet.coins, 40);
  closet.addCoins(-40);
  assert.equal(createCloset(storage).coins, 0);
  const poor = createCloset(memory(), { coins: 10 });
  assert.equal(poor.buy('twin').reason, 'coins');
  assert.equal(poor.coins, 10);
});

test('damaged or odd saved data does not break the closet', () => {
  const storage = memory();
  storage.setItem(closetKey, '{"owned":["long","ghost"],"equipped":"ghost","coins":5}');
  const closet = createCloset(storage);
  assert.deepEqual(closet.owned, ['classic', 'long']);
  assert.equal(closet.equipped, 'classic');
  storage.setItem(closetKey, 'not json');
  assert.equal(createCloset(storage).coins, 340);
});
