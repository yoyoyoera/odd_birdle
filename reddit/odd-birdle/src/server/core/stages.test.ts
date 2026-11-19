import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => {
  const hashes = new Map<string, Map<string, string>>();
  const strings = new Map<string, string>();
  const expiries = new Map<string, number>();
  const context: { userId?: string; postId?: string } = { userId: 't2_player', postId: 't3_game' };
  const hash = (key: string) => {
    let value = hashes.get(key);
    if (!value) { value = new Map(); hashes.set(key, value); }
    return value;
  };
  return {
    hashes, strings, expiries, context,
    redis: {
      get: vi.fn(async (key: string) => strings.get(key)),
      set: vi.fn(async (key: string, value: string, options: { expiration: Date }) => {
        strings.set(key, value);
        expiries.set(key, Math.round((options.expiration.getTime() - Date.now()) / 1000));
        return 'OK';
      }),
      hGetAll: vi.fn(async (key: string) => Object.fromEntries(hashes.get(key) ?? [])),
      hSet: vi.fn(async (key: string, fields: Record<string, string>) => {
        for (const [field, value] of Object.entries(fields)) hash(key).set(field, value);
        return Object.keys(fields).length;
      }),
      hSetNX: vi.fn(async (key: string, field: string, value: string) => {
        if (hash(key).has(field)) return 0;
        hash(key).set(field, value);
        return 1;
      }),
      hKeys: vi.fn(async (key: string) => [...(hashes.get(key)?.keys() ?? [])]),
      hLen: vi.fn(async (key: string) => hashes.get(key)?.size ?? 0),
      hDel: vi.fn(async (key: string, fields: string[]) => {
        let count = 0;
        for (const field of fields) if (hashes.get(key)?.delete(field)) count++;
        if (hashes.get(key)?.size === 0) hashes.delete(key);
        return count;
      }),
      del: vi.fn(async (...keys: string[]) => {
        for (const key of keys) { hashes.delete(key); strings.delete(key); expiries.delete(key); }
      }),
      expire: vi.fn(async (key: string, seconds: number) => { expiries.set(key, seconds); }),
    },
  };
});
vi.mock('@devvit/web/server', () => ({ context: fixture.context, redis: fixture.redis }));
vi.mock('../core/post', () => ({ createPost: vi.fn() }));

import { clearStage, deletePostStageProgress, deleteStageProgress, getStageProgress, stageRetentionSeconds } from './stages';
import { stages } from '../routes/stages';
import { triggers } from '../routes/triggers';

beforeEach(() => {
  fixture.hashes.clear(); fixture.strings.clear(); fixture.expiries.clear(); vi.clearAllMocks();
  fixture.context.userId = 't2_player'; fixture.context.postId = 't3_game';
});

const post = (body: unknown) => stages.request('/', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('stage progress', () => {
  it('unions clears without overwriting previous stages and repeats idempotently', async () => {
    await clearStage('t2_player', 't3_first', 2);
    await clearStage('t2_player', 't3_second', 1);
    await clearStage('t2_player', 't3_second', 2);
    expect(await getStageProgress('t2_player')).toEqual([1, 2]);
    expect(fixture.hashes.get('stages:v1:user:t2_player')?.get('2')).toBe('t3_first');
    expect([...fixture.hashes.keys()].sort()).toEqual([
      'stages:v1:post:t3_first', 'stages:v1:post:t3_second', 'stages:v1:user:t2_player',
    ]);
  });
  it('gates stage 21 on all twenty clears, rather than stage 20 alone', async () => {
    await clearStage('t2_player', 't3_game', 20);
    expect(await clearStage('t2_player', 't3_game', 21)).toBeUndefined();
    for (let stage = 1; stage <= 19; stage++) await clearStage('t2_player', 't3_game', stage);
    expect(await clearStage('t2_player', 't3_game', 21)).toEqual(Array.from({ length: 21 }, (_, i) => i + 1));
  });
  it('expires user records and all associated identity indexes within 30 days', async () => {
    await clearStage('t2_player', 't3_first', 1);
    await clearStage('t2_player', 't3_second', 2);
    for (const key of [...fixture.hashes.keys(), ...fixture.strings.keys()]) expect(fixture.expiries.get(key)).toBe(stageRetentionSeconds);
    for (const [key, fields] of fixture.hashes) {
      if (key.includes(':post:')) expect(JSON.stringify([...fields])).not.toContain('t2_player');
    }
  });
  it('removes all user references on an explicit privacy deletion', async () => {
    await clearStage('t2_player', 't3_first', 1);
    await clearStage('t2_player', 't3_second', 2);
    await clearStage('t2_other', 't3_first', 3);
    await deleteStageProgress('t2_player');
    expect(await getStageProgress('t2_player')).toEqual([]);
    expect(await getStageProgress('t2_other')).toEqual([3]);
    expect(JSON.stringify([...fixture.hashes].map(([key, fields]) => [key, [...fields]]))).not.toContain('t2_player');
    expect([...fixture.strings.values()]).not.toContain('t2_player');
  });
  it('post deletion removes its clears for every player but preserves other posts', async () => {
    await clearStage('t2_player', 't3_first', 1);
    await clearStage('t2_player', 't3_second', 2);
    await clearStage('t2_other', 't3_first', 3);
    await deletePostStageProgress('t3_first');
    await deletePostStageProgress('t3_first');
    expect(await getStageProgress('t2_player')).toEqual([2]);
    expect(await getStageProgress('t2_other')).toEqual([]);
    expect(fixture.hashes.has('stages:v1:post:t3_first')).toBe(false);
    expect(fixture.hashes.has('stages:v1:user:t2_other')).toBe(false);
  });
});

describe('stage HTTP API', () => {
  it('takes the authenticated identity, ignoring client identity fields', async () => {
    expect((await post({ stage: 3, userId: 't2_victim' })).status).toBe(200);
    const response = await stages.request('/');
    expect(await response.json()).toEqual({ cleared: [3], userId: 't2_player' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await getStageProgress('t2_victim')).toEqual([]);
  });
  it('rejects signed-out reads, writes, and deletes', async () => {
    fixture.context.userId = undefined;
    expect((await stages.request('/')).status).toBe(401);
    expect((await post({ stage: 1 })).status).toBe(401);
    expect((await stages.request('/', { method: 'DELETE' })).status).toBe(401);
  });
  it('rejects malformed and out-of-range stage numbers', async () => {
    for (const stage of [0, 22, 1.5, '1', null]) expect((await post({ stage })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
    expect((await stages.request('/', { method: 'POST', body: '{' })).status).toBe(400);
    expect(fixture.hashes.size).toBe(0);
  });
  it('requires a Reddit post when recording a clear', async () => {
    fixture.context.postId = undefined;
    expect((await post({ stage: 1 })).status).toBe(400);
  });
  it('returns a hidden-stage conflict until all prerequisites exist', async () => {
    expect((await post({ stage: 21 })).status).toBe(409);
  });
  it('keeps temporary storage failures recoverable for browser fallback', async () => {
    fixture.redis.hGetAll.mockRejectedValueOnce(new Error('temporary'));
    expect((await stages.request('/')).status).toBe(503);
  });
  it('deletes only the signed-in user on DELETE', async () => {
    await clearStage('t2_player', 't3_game', 1);
    await clearStage('t2_other', 't3_game', 2);
    expect((await stages.request('/', { method: 'DELETE' })).status).toBe(200);
    expect(await getStageProgress('t2_player')).toEqual([]);
    expect(await getStageProgress('t2_other')).toEqual([2]);
  });
  it('registers idempotent post deletion handling even without an author snapshot', async () => {
    await clearStage('t2_player', 't3_game', 1);
    const response = await triggers.request('/on-post-delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'PostDelete', postId: 't3_game' }),
    });
    expect(response.status).toBe(200);
    expect(await getStageProgress('t2_player')).toEqual([]);
  });
});
