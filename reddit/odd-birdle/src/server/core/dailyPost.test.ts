import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => {
  const hashes = new Map<string, Map<string, string>>();
  return {
    hashes,
    submit: vi.fn(async () => ({ id: 't3_post' })),
    redis: {
      hSetNX: vi.fn(async (key: string, field: string, value: string) => {
        const hash = hashes.get(key) ?? new Map<string, string>();
        hashes.set(key, hash);
        if (hash.has(field)) return 0;
        hash.set(field, value);
        return 1;
      }),
      hSet: vi.fn(async (key: string, fields: Record<string, string>) => {
        const hash = hashes.get(key) ?? new Map<string, string>();
        hashes.set(key, hash);
        for (const [f, v] of Object.entries(fields)) hash.set(f, v);
        return 1;
      }),
      hDel: vi.fn(async (key: string, fields: string[]) => { for (const f of fields) hashes.get(key)?.delete(f); return fields.length; }),
      expire: vi.fn(async () => {})
    }
  };
});
vi.mock('@devvit/web/server', () => ({ redis: fixture.redis, reddit: { submitCustomPost: fixture.submit } }));

import { dailyTitle, postTodaysDaily } from './dailyPost';

const day = Date.parse('2026-12-02T00:00:05Z');

beforeEach(() => { fixture.hashes.clear(); vi.clearAllMocks(); fixture.submit.mockImplementation(async () => ({ id: 't3_post' })); });

describe('the daily post', () => {
  it('has a title with the number, the challenge and the day', () => {
    expect(dailyTitle('2026-12-02')).toMatch(/^Daily #14 · Five in a Row \(Dec 2\)$/);
    expect(dailyTitle('2026-11-19')).toMatch(/^Daily #1 · .+ \(Nov 19\)$/);
  });

  it('posts once a day, however many times it is asked', async () => {
    expect(await postTodaysDaily(day)).toMatchObject({ posted: true, date: '2026-12-02', postId: 't3_post' });
    expect(await postTodaysDaily(day + 3600_000)).toMatchObject({ posted: false, reason: 'already' });
    expect(fixture.submit).toHaveBeenCalledTimes(1);
    expect(fixture.submit).toHaveBeenCalledWith({ title: dailyTitle('2026-12-02') });
  });

  it('a new day gets its own post', async () => {
    await postTodaysDaily(day);
    expect(await postTodaysDaily(day + 24 * 3600_000)).toMatchObject({ posted: true, date: '2026-12-03' });
    expect(fixture.submit).toHaveBeenCalledTimes(2);
  });

  it('gives the day back when the post fails, so it can be tried again', async () => {
    fixture.submit.mockImplementationOnce(async () => { throw new Error('reddit is down'); });
    expect(await postTodaysDaily(day)).toMatchObject({ posted: false, reason: 'failed' });
    expect(await postTodaysDaily(day + 60_000)).toMatchObject({ posted: true });
  });
});
