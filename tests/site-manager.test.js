import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkListing, checkPage, selectMetrics, metricDelta, releaseDraft, request, run } from '../tools/site-manager/bot.mjs';

const release = { id: 12, tag_name: 'v1.0', name: 'A real release', body: 'Ready-state fix.', published_at: '2026-11-17T00:00:00Z', html_url: 'https://github.com/yoyoyoera/odd_birdle/releases/tag/v1.0' };
const configPath = new URL('../tools/site-manager/config.json', import.meta.url);
const response = body => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 });
function mockNetwork({ releases = [release], metrics = 20, failItch = false } = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('api.github.com')) return response(releases);
    if (url.includes('api.itch.io')) return failItch ? new Response('secret response body', { status: 403 }) : response({ games: [{ id: 5350750, views_count: metrics, downloads_count: 3, earnings: 'private' }, { id: 99, views_count: 999999 }] });
    if (url.includes('itch.io/search') || url.includes('itch.io/games/')) return response('<html><title>itch.io</title><a href="https://studiyo21.itch.io/odd-birdle">Game</a></html>');
    return response('<html><title>Odd Birdle</title><body>Our game</body></html>');
  };
  return { fetcher, calls };
}

test('blocked listing is unknown; a similar slug is not an index hit', () => {
  assert.equal(checkListing({ ok: false, reason: 'HTTP 429' }, 'https://studiyo21.itch.io/odd-birdle').state, 'unknown');
  const unrelated = { ok: true, status: 200, text: '<html>itch.io<a href="https://studiyo21.itch.io/odd-birdle-other">x</a></html>' };
  assert.equal(checkListing(unrelated, 'https://studiyo21.itch.io/odd-birdle').state, 'not_in_response');
  assert.equal(checkListing({ ...unrelated, text: unrelated.text.replace('odd-birdle-other', 'odd-birdle?ref=search') }, 'https://studiyo21.itch.io/odd-birdle').state, 'found');
});

test('login/placeholder pages never pass a public-game check', () => {
  assert.equal(checkPage({ ok: true, status: 200, text: '<title>Log in</title>' }, 'Odd Birdle').state, 'unexpected_page');
  assert.equal(checkPage({ ok: false, reason: 'network_or_redirect_error' }, 'Odd Birdle').state, 'unknown');
});

test('API selection drops other games/private financial fields and preserves missing counters', () => {
  const selected = selectMetrics({ games: [{ id: 1, views_count: 50 }, { id: 5350750, views_count: 0, earnings: ['private'] }] }, 5350750);
  assert.deepEqual(selected, { state: 'ok', metrics: { views_count: 0 } });
  assert.equal(selectMetrics({ games: [{ id: 5350750 }] }, 5350750).state, 'unknown');
  assert.deepEqual(metricDelta({ views_count: 2 }, { views_count: 10 }), { views_count: 'counter_reset' });
});

test('drafts exclude prereleases, unpublished releases, empty notes and foreign URLs', () => {
  for (const patch of [{ draft: true }, { prerelease: true }, { published_at: null }, { body: ' ' }, { html_url: 'https://example.com/fake' }]) assert.equal(releaseDraft({ ...release, ...patch }), null);
  assert.match(releaseDraft(release).content, /Verify that this release is live on itch/);
  assert.notEqual(releaseDraft(release).id, releaseDraft({ ...release, body: 'Corrected notes' }).id);
});

test('network failures/challenges never leak bearer tokens or server response bodies', async () => {
  const secret = 'SECRET_DO_NOT_SAVE';
  const failure = await request('https://api.itch.io/profile/games', { headers: { Authorization: `Bearer ${secret}` }, fetcher: async () => { throw new Error(secret); } });
  assert.ok(!JSON.stringify(failure).includes(secret));
  const challenge = await request('https://itch.io/search', { fetcher: async () => response('<title>Just a moment</title>verify you are human') });
  assert.equal(challenge.reason, 'challenge');
});

test('full run is read-only, caches requests, deduplicates drafts and keeps metrics baseline across failure', async () => {
  const out = await mkdtemp(join(tmpdir(), 'oddbirdle-manager-test-'));
  const env = { ITCH_API_KEY: 'SECRET_ITCH_TOKEN' };
  try {
    const first = mockNetwork();
    const initial = await run({ out, configPath, env, ...first, now: new Date('2026-11-17T01:00:00Z') });
    assert.equal(initial.report.platforms.find(p => p.id === 'gamepix').observation.state, 'manual_status');
    assert.ok(first.calls.every(c => c.options.method === 'GET'));
    assert.ok(first.calls.every(c => !/my\.gamepix|y8|gamedistribution/.test(c.url)));
    const saved = await readFile(join(out, 'state.json'), 'utf8');
    assert.ok(!saved.includes('SECRET_ITCH_TOKEN') && !saved.includes('private') && !saved.includes('999999'));
    const id = releaseDraft(release).id;
    await writeFile(join(out, 'drafts', `${id}.md`), 'Human edited draft');
    const cached = await run({ out, configPath, env, fetcher: () => assert.fail('cached run must not call network'), now: new Date('2026-11-17T02:00:00Z') });
    assert.equal(cached.cached, true);
    await run({ out, configPath, env, ...mockNetwork({ failItch: true }), now: new Date('2026-11-17T10:00:00Z') });
    await run({ out, configPath, env, ...mockNetwork({ metrics: 25 }), now: new Date('2026-11-18T01:00:00Z') });
    const report = await readFile(join(out, 'latest.md'), 'utf8');
    assert.match(report, /직전 수집 대비 \+5/);
    assert.match(report, /2026/);
    assert.equal(await readFile(join(out, 'drafts', `${id}.md`), 'utf8'), 'Human edited draft');
  } finally { await rm(out, { recursive: true, force: true }); }
});
