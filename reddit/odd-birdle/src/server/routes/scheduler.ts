import { Hono } from 'hono';
import { postTodaysDaily } from '../core/dailyPost';

export const scheduler = new Hono();

// Called by the scheduler every day at 00:00 UTC (see devvit.json).
scheduler.post('/daily-post', async (c) => {
  const result = await postTodaysDaily();
  return c.json({ status: result.posted || result.reason === 'already' ? 'success' : 'error', ...result }, result.posted || result.reason === 'already' ? 200 : 500);
});
