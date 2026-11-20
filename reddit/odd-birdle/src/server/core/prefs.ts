import { redis } from '@devvit/web/server';

// A player's settings, kept for their Reddit account (so they are the same on every phone and after leaving the game).
// Only the thumb pad's sensitivity for now. Removed with the player's data; expires after 180 days without use.
export const prefsRetentionSeconds = 180 * 24 * 60 * 60;
export const padGainRange = { min: 0.8, max: 3 };
const userKey = (userId: string) => `prefs:v1:user:${userId}`;

export interface Prefs { padGain?: number }

export async function getPrefs(userId: string): Promise<Prefs> {
  const record = await redis.hGetAll(userKey(userId));
  const padGain = Number(record.padGain);
  return Number.isFinite(padGain) && padGain >= padGainRange.min && padGain <= padGainRange.max ? { padGain } : {};
}

export async function setPadGain(userId: string, value: unknown): Promise<Prefs | undefined> {
  const padGain = Number(value);
  if (!Number.isFinite(padGain) || padGain < padGainRange.min || padGain > padGainRange.max) return undefined;
  const rounded = Math.round(padGain * 100) / 100;
  await redis.hSet(userKey(userId), { padGain: String(rounded) });
  await redis.expire(userKey(userId), prefsRetentionSeconds);
  return { padGain: rounded };
}

export async function deletePrefs(userId: string): Promise<void> {
  await redis.del(userKey(userId));
}
