import { randomUUID } from 'node:crypto';
import { redis } from '@devvit/web/server';

// Redis is installation/subreddit-scoped. Shared post indexes contain random
// tokens, never user IDs: another player's activity must not extend retention
// of an old identity. Only independently expiring records can resolve a token.
export const stageRetentionSeconds = 30 * 24 * 60 * 60;
const userKey = (userId: string) => `stages:v1:user:${userId}`;
const identityKey = (token: string) => `stages:v1:identity:${token}`;
const postKey = (postId: string) => `stages:v1:post:${postId}`;
const sources = (record: Record<string, string>) => new Set(
  Object.entries(record).filter(([field]) => isStageNumber(Number(field))).map(([, source]) => source)
);

export function isStageNumber(stage: unknown): stage is number {
  return typeof stage === 'number' && Number.isInteger(stage) && stage >= 1 && stage <= 21;
}

function clearedFrom(record: Record<string, string>): number[] {
  return Object.keys(record).map(Number).filter(isStageNumber).sort((a, b) => a - b);
}

export async function getStageProgress(userId: string): Promise<number[]> {
  return clearedFrom(await redis.hGetAll(userKey(userId)));
}

export async function clearStage(userId: string, postId: string, stage: number): Promise<number[] | undefined> {
  const key = userKey(userId);
  const record = await redis.hGetAll(key);
  if (stage === 21 && !Array.from({ length: 20 }, (_, i) => String(i + 1)).every((id) => record[id])) {
    return undefined;
  }
  await redis.hSetNX(key, '_token', randomUUID());
  await redis.expire(key, stageRetentionSeconds);
  const token = (await redis.hGetAll(key))._token;
  if (!token) throw new Error('Progress identity is unavailable');
  await redis.set(identityKey(token), userId, { expiration: new Date(Date.now() + stageRetentionSeconds * 1000) });
  // Index first so post deletion can discover a clear even after a partial write.
  const sourcePost = record[String(stage)] ?? postId;
  await redis.hSet(postKey(sourcePost), { [token]: '1' });
  await redis.expire(postKey(sourcePost), stageRetentionSeconds);
  await redis.hSetNX(key, String(stage), postId);
  await redis.expire(key, stageRetentionSeconds);
  const updated = await redis.hGetAll(key);
  // Refresh all source indexes when a clear extends this user's retention.
  for (const source of sources(updated)) {
    await redis.hSet(postKey(source), { [token]: '1' });
    await redis.expire(postKey(source), stageRetentionSeconds);
  }
  return clearedFrom(updated);
}

export async function deleteStageProgress(userId: string): Promise<void> {
  const key = userKey(userId);
  const record = await redis.hGetAll(key);
  if (record._token) {
    for (const postId of sources(record)) await redis.hDel(postKey(postId), [record._token]);
    await redis.del(identityKey(record._token));
  }
  await redis.del(key);
}

export async function deletePostStageProgress(postId: string): Promise<void> {
  const index = postKey(postId);
  for (const token of await redis.hKeys(index)) {
    const userId = await redis.get(identityKey(token));
    if (!userId) continue;
    const key = userKey(userId);
    const record = await redis.hGetAll(key);
    if (record._token !== token) continue;
    const removed = Object.entries(record).filter(([field, source]) => isStageNumber(Number(field)) && source === postId).map(([stage]) => stage);
    if (removed.length > 0) await redis.hDel(key, removed);
    if (clearedFrom(await redis.hGetAll(key)).length === 0) await deleteStageProgress(userId);
  }
  await redis.del(index);
}
