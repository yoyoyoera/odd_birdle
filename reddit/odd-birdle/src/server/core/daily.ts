import { randomUUID } from 'node:crypto';
import { redis } from '@devvit/web/server';
import { dailyFor, minimumSeconds, utcDate, type DailyPlan } from '../../shared/daily-plan';

// The daily challenge. The server is the one that knows which challenge is today's, how many tries a player has used,
// and what they cleared: the browser only plays it and shows it. A clear is timed by the server (start to finish), so a
// claimed time means nothing, and it takes a place in the order of the day (rank 1 = the first to clear).
// Per-player records expire after 40 days and are removed with the player's other data on request.
export const retentionSeconds = 40 * 24 * 60 * 60;
const tokenSeconds = 3 * 60 * 60;
const userKey = (userId: string) => `daily:v1:user:${userId}`;
const tokenKey = (token: string) => `daily:v1:token:${token}`;
const countKey = (date: string) => `daily:v1:day:${date}:count`;
const expiresIn = (seconds: number) => new Date(Date.now() + seconds * 1000);

export interface ClearRecord { rank: number; seconds: number; mine: number; theirs: number; attempt: number; date: string }
export interface TodayState {
  plan: DailyPlan;
  attemptsUsed: number;
  cleared?: ClearRecord;
}

const parseClear = (text: string | undefined): ClearRecord | undefined => {
  if (!text) return undefined;
  try {
    const value = JSON.parse(text) as ClearRecord;
    return Number.isFinite(value.rank) && Number.isFinite(value.seconds) ? value : undefined;
  } catch { return undefined; }
};

export async function getToday(userId: string, now = Date.now()): Promise<TodayState> {
  const plan = dailyFor(utcDate(now));
  const record = await redis.hGetAll(userKey(userId));
  return {
    plan,
    attemptsUsed: Number(record[`att:${plan.date}`] ?? 0) || 0,
    cleared: parseClear(record[`clear:${plan.date}`])
  };
}

export type StartResult =
  | { ok: true; token: string; attempt: number; plan: DailyPlan }
  | { ok: false; reason: 'cleared' | 'no-attempts'; state: TodayState };

export async function startAttempt(userId: string, now = Date.now()): Promise<StartResult> {
  const state = await getToday(userId, now);
  if (state.cleared) return { ok: false, reason: 'cleared', state };
  if (state.attemptsUsed >= state.plan.attempts) return { ok: false, reason: 'no-attempts', state };
  const attempt = state.attemptsUsed + 1;
  const key = userKey(userId);
  await redis.hSet(key, { [`att:${state.plan.date}`]: String(attempt) });
  await redis.expire(key, retentionSeconds);
  const token = randomUUID();
  await redis.set(tokenKey(token), JSON.stringify({ userId, date: state.plan.date, startedAt: now, attempt }), { expiration: expiresIn(tokenSeconds) });
  return { ok: true, token, attempt, plan: state.plan };
}

export type FinishResult =
  | { ok: true; cleared: false; state: TodayState }
  | { ok: true; cleared: true; record: ClearRecord; fresh: boolean }
  | { ok: false; reason: 'bad-token' | 'too-fast' | 'bad-result' };

export async function finishAttempt(
  userId: string, token: string, result: { won: boolean; mine: number; theirs: number }, now = Date.now()
): Promise<FinishResult> {
  const text = await redis.get(tokenKey(token));
  if (!text) return { ok: false, reason: 'bad-token' };
  let attempt: { userId: string; date: string; startedAt: number; attempt: number };
  try { attempt = JSON.parse(text); } catch { return { ok: false, reason: 'bad-token' }; }
  if (attempt.userId !== userId) return { ok: false, reason: 'bad-token' };
  await redis.del(tokenKey(token)); // one use
  const plan = dailyFor(attempt.date);
  if (!result.won) return { ok: true, cleared: false, state: await getToday(userId, now) };
  if (!Number.isInteger(result.mine) || !Number.isInteger(result.theirs) || result.mine < plan.points || result.theirs < 0 || result.theirs >= Math.max(plan.points, 11)) {
    return { ok: false, reason: 'bad-result' };
  }
  const seconds = Math.round((now - attempt.startedAt) / 100) / 10;
  if (seconds < minimumSeconds(plan.points)) return { ok: false, reason: 'too-fast' };
  const key = userKey(userId);
  const existing = parseClear((await redis.hGetAll(key))[`clear:${plan.date}`]);
  if (existing) return { ok: true, cleared: true, record: existing, fresh: false };
  const rank = await redis.incrBy(countKey(plan.date), 1);
  await redis.expire(countKey(plan.date), 3 * 24 * 60 * 60);
  const record: ClearRecord = { rank, seconds, mine: result.mine, theirs: result.theirs, attempt: attempt.attempt, date: plan.date };
  await redis.hSet(key, { [`clear:${plan.date}`]: JSON.stringify(record) });
  await redis.expire(key, retentionSeconds);
  return { ok: true, cleared: true, record, fresh: true };
}

// The dates this player cleared, for the calendar.
export async function getCalendar(userId: string): Promise<string[]> {
  const record = await redis.hGetAll(userKey(userId));
  return Object.keys(record).filter((field) => field.startsWith('clear:')).map((field) => field.slice(6)).sort();
}

export async function getClear(userId: string, date: string): Promise<ClearRecord | undefined> {
  return parseClear((await redis.hGetAll(userKey(userId)))[`clear:${date}`]);
}

export async function deleteDailyProgress(userId: string): Promise<void> {
  await redis.del(userKey(userId));
}
