import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => {
  const hashes = new Map<string, Map<string, string>>();
  const strings = new Map<string, string>();
  const counters = new Map<string, number>();
  const ttl = new Map<string, number>();
  const hash = (key: string) => {
    let value = hashes.get(key);
    if (!value) { value = new Map(); hashes.set(key, value); }
    return value;
  };
  return {
    hashes, strings, counters, ttl,
    redis: {
      get: vi.fn(async (key: string) => strings.get(key)),
      set: vi.fn(async (key: string, value: string) => { strings.set(key, value); return 'OK'; }),
      del: vi.fn(async (...keys: string[]) => { for (const key of keys) { strings.delete(key); hashes.delete(key); } return keys.length; }),
      expire: vi.fn(async (key: string, seconds: number) => { ttl.set(key, seconds); }),
      incrBy: vi.fn(async (key: string, by: number) => { counters.set(key, (counters.get(key) ?? 0) + by); return counters.get(key) as number; }),
      hGetAll: vi.fn(async (key: string) => Object.fromEntries(hashes.get(key) ?? [])),
      hSet: vi.fn(async (key: string, fields: Record<string, string>) => { for (const [f, v] of Object.entries(fields)) hash(key).set(f, v); return 1; }),
      hDel: vi.fn(async (key: string, fields: string[]) => { let n = 0; for (const f of fields) if (hashes.get(key)?.delete(f)) n++; return n; })
    }
  };
});

vi.mock('@devvit/web/server', () => ({ redis: fixture.redis }));

import { dailyFor } from '../../shared/daily-plan';
import { deleteDailyProgress, finishAttempt, getBoard, getCalendar, getToday, retentionSeconds, startAttempt } from './daily';

const day = Date.parse('2026-12-02T10:00:00Z');
const plan = dailyFor('2026-12-02');
const win = { won: true, mine: plan.points, theirs: 1 };

beforeEach(() => {
  fixture.hashes.clear(); fixture.strings.clear(); fixture.counters.clear(); fixture.ttl.clear();
  vi.clearAllMocks();
});

describe('the daily challenge on the server', () => {
  it('starts a try, counts it, and stops when the tries are used up', async () => {
    for (let attempt = 1; attempt <= plan.attempts; attempt++) {
      const started = await startAttempt('t2_a', day);
      expect(started.ok).toBe(true);
      if (started.ok) expect(started.attempt).toBe(attempt);
    }
    const extra = await startAttempt('t2_a', day);
    expect(extra).toMatchObject({ ok: false, reason: 'no-attempts' });
    expect((await getToday('t2_a', day)).attemptsUsed).toBe(plan.attempts);
  });

  it('times a clear itself and gives ranks in the order of clearing', async () => {
    const first = await startAttempt('t2_a', day);
    const second = await startAttempt('t2_b', day);
    if (!first.ok || !second.ok) throw new Error('could not start');
    const clearA = await finishAttempt('t2_a', first.token, win, day + 61_300);
    const clearB = await finishAttempt('t2_b', second.token, win, day + 90_000);
    expect(clearA).toMatchObject({ ok: true, cleared: true, fresh: true, record: { rank: 1, seconds: 61.3 } });
    expect(clearB).toMatchObject({ ok: true, cleared: true, record: { rank: 2, seconds: 90 } });
    expect(await getCalendar('t2_a')).toEqual(['2026-12-02']);
  });

  it('a claimed time or a second clear changes nothing: the first clear stands', async () => {
    const started = await startAttempt('t2_a', day);
    if (!started.ok) throw new Error('could not start');
    const first = await finishAttempt('t2_a', started.token, win, day + 50_000);
    expect(first).toMatchObject({ ok: true, cleared: true, record: { rank: 1, seconds: 50 } });
    const again = await startAttempt('t2_a', day + 60_000);
    expect(again).toMatchObject({ ok: false, reason: 'cleared' });
    expect(await getToday('t2_a', day + 70_000)).toMatchObject({ cleared: { rank: 1, seconds: 50 } });
  });

  it('refuses a token that is used twice, is another player\'s or has expired', async () => {
    const started = await startAttempt('t2_a', day);
    if (!started.ok) throw new Error('could not start');
    expect(await finishAttempt('t2_b', started.token, win, day + 60_000)).toMatchObject({ ok: false, reason: 'bad-token' });
    expect(await finishAttempt('t2_a', started.token, win, day + 60_000)).toMatchObject({ ok: true, cleared: true });
    expect(await finishAttempt('t2_a', started.token, win, day + 61_000)).toMatchObject({ ok: false, reason: 'bad-token' });
    expect(await finishAttempt('t2_a', 'nope', win, day)).toMatchObject({ ok: false, reason: 'bad-token' });
  });

  it('refuses a win that is too fast to be real or that does not reach the target', async () => {
    const quick = await startAttempt('t2_a', day);
    if (!quick.ok) throw new Error('could not start');
    expect(await finishAttempt('t2_a', quick.token, win, day + 1_000)).toMatchObject({ ok: false, reason: 'too-fast' });
    const short = await startAttempt('t2_a', day);
    if (!short.ok) throw new Error('could not start');
    expect(await finishAttempt('t2_a', short.token, { won: true, mine: plan.points - 1, theirs: 0 }, day + 60_000)).toMatchObject({ ok: false, reason: 'bad-result' });
    expect((await getToday('t2_a', day)).cleared).toBeUndefined();
  });

  it('a lost try is just a try', async () => {
    const started = await startAttempt('t2_a', day);
    if (!started.ok) throw new Error('could not start');
    const lost = await finishAttempt('t2_a', started.token, { won: false, mine: 1, theirs: plan.points }, day + 40_000);
    expect(lost).toMatchObject({ ok: true, cleared: false, state: { attemptsUsed: 1 } });
  });

  it('records expire, and can be deleted with the player', async () => {
    const started = await startAttempt('t2_a', day);
    if (!started.ok) throw new Error('could not start');
    await finishAttempt('t2_a', started.token, win, day + 60_000);
    expect(fixture.ttl.get('daily:v1:user:t2_a')).toBe(retentionSeconds);
    await deleteDailyProgress('t2_a');
    expect(await getCalendar('t2_a')).toEqual([]);
    expect((await getToday('t2_a', day)).attemptsUsed).toBe(0);
  });

  it('a new day brings a fresh set of tries', async () => {
    await startAttempt('t2_a', day);
    const next = await getToday('t2_a', day + 24 * 3600 * 1000);
    expect(next.attemptsUsed).toBe(0);
    expect(next.plan.date).toBe('2026-12-03');
  });

  it('keeps the first five clears on a board with their names, and takes a player off it when asked', async () => {
    const ids = ['t2_1', 't2_2', 't2_3', 't2_4', 't2_5', 't2_6'];
    for (const [index, id] of ids.entries()) {
      const started = await startAttempt(id, day);
      if (!started.ok) throw new Error('could not start');
      await finishAttempt(id, started.token, win, day + (60 + index) * 1000, `name${index + 1}`);
    }
    const board = await getBoard('2026-12-02');
    expect(board.map((entry) => entry.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(board[0]).toMatchObject({ name: 'name1', seconds: 60 });
    await deleteDailyProgress('t2_2');
    expect((await getBoard('2026-12-02')).map((entry) => entry.name)).toEqual(['name1', 'name3', 'name4', 'name5']);
  });
});
