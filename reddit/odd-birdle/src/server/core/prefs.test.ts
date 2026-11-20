import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => {
  const hashes = new Map<string, Map<string, string>>();
  const ttl = new Map<string, number>();
  return {
    hashes, ttl,
    redis: {
      hGetAll: vi.fn(async (key: string) => Object.fromEntries(hashes.get(key) ?? [])),
      hSet: vi.fn(async (key: string, fields: Record<string, string>) => {
        const hash = hashes.get(key) ?? new Map<string, string>();
        hashes.set(key, hash);
        for (const [field, value] of Object.entries(fields)) hash.set(field, value);
        return 1;
      }),
      expire: vi.fn(async (key: string, seconds: number) => { ttl.set(key, seconds); }),
      del: vi.fn(async (...keys: string[]) => { for (const key of keys) hashes.delete(key); return keys.length; })
    }
  };
});
vi.mock('@devvit/web/server', () => ({ redis: fixture.redis }));

import { deletePrefs, getPrefs, prefsRetentionSeconds, setPadGain } from './prefs';

beforeEach(() => { fixture.hashes.clear(); fixture.ttl.clear(); vi.clearAllMocks(); });

describe('player settings on the server', () => {
  it('keeps the thumb pad sensitivity per account and gives it back', async () => {
    expect(await getPrefs('t2_a')).toEqual({});
    expect(await setPadGain('t2_a', 2.35)).toEqual({ padGain: 2.35 });
    expect(await getPrefs('t2_a')).toEqual({ padGain: 2.35 });
    expect(await getPrefs('t2_b')).toEqual({});
    expect(fixture.ttl.get('prefs:v1:user:t2_a')).toBe(prefsRetentionSeconds);
  });

  it('refuses values outside the bar, and rounds the rest', async () => {
    for (const bad of [0.5, 3.4, 'fast', null, NaN]) expect(await setPadGain('t2_a', bad)).toBeUndefined();
    expect(await setPadGain('t2_a', 1.23456)).toEqual({ padGain: 1.23 });
  });

  it('is removed with the player', async () => {
    await setPadGain('t2_a', 2);
    await deletePrefs('t2_a');
    expect(await getPrefs('t2_a')).toEqual({});
  });
});
