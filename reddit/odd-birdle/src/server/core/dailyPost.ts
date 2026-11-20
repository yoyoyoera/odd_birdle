import { reddit, redis } from '@devvit/web/server';
import { challengeNames, dailyFor, utcDate } from '../../shared/daily-plan';

// One post a day for the daily challenge: the place where the day's cards and talk gather. The scheduler asks for it at
// 00:00 UTC (09:00 in Korea); a moderator can ask for it by hand. A day gets exactly one post: the first request takes the
// day's place before the post is made, and gives it back if the post could not be made.
const postsKey = 'daily:v1:posts';
const retentionSeconds = 40 * 24 * 60 * 60;
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dailyTitle(date: string): string {
  const plan = dailyFor(date);
  const day = `${months[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
  return `Daily #${plan.number} · ${challengeNames[plan.key] ?? plan.key} (${day})`;
}

export type DailyPostResult = { posted: true; date: string; postId: string } | { posted: false; date: string; reason: 'already' | 'failed' };

export async function postTodaysDaily(now = Date.now()): Promise<DailyPostResult> {
  const date = utcDate(now);
  const claimed = await redis.hSetNX(postsKey, date, 'pending');
  if (!claimed) return { posted: false, date, reason: 'already' };
  try {
    const post = await reddit.submitCustomPost({ title: dailyTitle(date) });
    await redis.hSet(postsKey, { [date]: post.id });
    await redis.expire(postsKey, retentionSeconds);
    return { posted: true, date, postId: post.id };
  } catch (error) {
    console.error('daily post failed:', String(error));
    await redis.hDel(postsKey, [date]);
    return { posted: false, date, reason: 'failed' };
  }
}
