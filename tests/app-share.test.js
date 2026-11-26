import test from 'node:test';
import assert from 'node:assert/strict';
import { shareCardImage } from '../app-share.js';

const canvas = { toDataURL: type => `data:${type};base64,QUJD` };

test('the card goes to the cache folder and then to the share sheet with its text', async () => {
  const calls = [];
  const plugins = {
    Filesystem: { writeFile: async options => { calls.push(['write', options]); return { uri: 'file:///cache/card.png' }; } },
    Share: { share: async options => { calls.push(['share', options]); } }
  };
  const outcome = await shareCardImage({ canvas, text: 'FULL-TIME 3:1', plugins });
  assert.equal(outcome, 'shared');
  assert.equal(calls[0][1].data, 'QUJD');
  assert.equal(calls[0][1].directory, 'CACHE');
  assert.match(calls[0][1].path, /^oddbirdle-card-\d+\.png$/);
  assert.deepEqual(calls[1][1].files, ['file:///cache/card.png']);
  assert.equal(calls[1][1].text, 'FULL-TIME 3:1');
});

test('closing the share sheet is not a failure', async () => {
  const plugins = {
    Filesystem: { writeFile: async () => ({ uri: 'file:///x.png' }) },
    Share: { share: async () => { throw new Error('Share canceled'); } }
  };
  assert.equal(await shareCardImage({ canvas, text: '', plugins }), 'cancelled');
});

test('without the plugins the card is downloaded', async () => {
  const link = { click() { this.clicked = true; }, remove() {} };
  const doc = { createElement: () => link, body: { append() {} } };
  const outcome = await shareCardImage({ canvas, text: '', plugins: undefined, doc });
  assert.equal(outcome, 'saved');
  assert.equal(link.href, 'data:image/png;base64,QUJD');
  assert.equal(link.download, 'oddbirdle-card.png');
  assert.equal(link.clicked, true);
});

test('a share that breaks for another reason falls back to the download', async () => {
  const plugins = { Filesystem: { writeFile: async () => { throw new Error('disk full'); } }, Share: { share: async () => {} } };
  const link = { click() {}, remove() {} };
  const outcome = await shareCardImage({ canvas, text: '', plugins, doc: { createElement: () => link, body: { append() {} } } });
  assert.equal(outcome, 'saved');
});

import { shareInvite } from '../app-share.js';

test('an invite goes to the share sheet with its text and link; closing it is not an error; no sheet means copy instead', async () => {
  const calls = [];
  const plugins = { Share: { share: async options => { calls.push(options); } } };
  assert.equal(await shareInvite({ text: 'Room code: ABC123', url: 'https://example.test/?room=ABC123', plugins }), 'shared');
  assert.equal(calls[0].text, 'Room code: ABC123');
  assert.equal(calls[0].url, 'https://example.test/?room=ABC123');
  const closing = { Share: { share: async () => { throw new Error('Share canceled'); } } };
  assert.equal(await shareInvite({ text: 't', url: 'u', plugins: closing }), 'cancelled');
  const broken = { Share: { share: async () => { throw new Error('no activity'); } } };
  assert.equal(await shareInvite({ text: 't', url: 'u', plugins: broken }), 'unavailable');
  assert.equal(await shareInvite({ text: 't', url: 'u', plugins: undefined }), 'unavailable');
});
