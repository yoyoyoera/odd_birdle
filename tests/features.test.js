import test from 'node:test';
import assert from 'node:assert/strict';
import { featureNames, readFeatures } from '../features.js';

test('no data-features (the website, every other portal): everything on', () => {
  assert.deepEqual(featureNames, ['stages', 'daily', 'online']);
  assert.deepEqual(readFeatures(undefined), { stages: true, daily: true, online: true });
  assert.deepEqual(readFeatures(null), { stages: true, daily: true, online: true });
});

test('data-features lists what is on; the rest is off', () => {
  assert.deepEqual(readFeatures(''), { stages: false, daily: false, online: false });
  assert.deepEqual(readFeatures('online'), { stages: false, daily: false, online: true });
  assert.deepEqual(readFeatures('stages daily'), { stages: true, daily: true, online: false });
  assert.deepEqual(readFeatures(' ONLINE,stages  unknown '), { stages: true, daily: false, online: true });
});

test('the page attribute is read once at load', async () => {
  globalThis.document = { documentElement: { dataset: { features: 'daily' } } };
  const { features } = await import('../features.js?page');
  assert.deepEqual(features, { stages: false, daily: true, online: false });
  delete globalThis.document;
});
