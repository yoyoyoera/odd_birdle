import { context, reddit } from '@devvit/web/server';
import { Hono } from 'hono';
import { finishAttempt, getBoard, getCalendar, getToday, startAttempt, deleteDailyProgress } from '../core/daily';

export const daily = new Hono();

daily.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  if (!context.userId) return c.json({ error: 'Sign in to play the daily challenge.' }, 401);
  await next();
});

daily.get('/', async (c) => {
  try {
    const userId = context.userId as string;
    const state = await getToday(userId);
    return c.json({ ...state, calendar: await getCalendar(userId), board: await getBoard(state.plan.date) });
  } catch {
    return c.json({ error: 'The daily challenge is temporarily unavailable.' }, 503);
  }
});

daily.post('/start', async (c) => {
  try {
    const result = await startAttempt(context.userId as string);
    return c.json(result, result.ok ? 200 : 409);
  } catch {
    return c.json({ error: 'The daily challenge is temporarily unavailable.' }, 503);
  }
});

daily.post('/finish', async (c) => {
  let input: { token?: unknown; won?: unknown; mine?: unknown; theirs?: unknown };
  try { input = await c.req.json(); } catch { return c.json({ error: 'Invalid result.' }, 400); }
  if (typeof input.token !== 'string' || typeof input.won !== 'boolean') return c.json({ error: 'Invalid result.' }, 400);
  try {
    const name = (await reddit.getCurrentUsername()) ?? '';
    const result = await finishAttempt(context.userId as string, input.token, {
      won: input.won, mine: Number(input.mine), theirs: Number(input.theirs)
    }, Date.now(), name);
    return c.json(result, result.ok ? 200 : 400);
  } catch {
    return c.json({ error: 'The result could not be saved. Try again later.' }, 503);
  }
});

daily.delete('/', async (c) => {
  try {
    await deleteDailyProgress(context.userId as string);
    return c.json({ ok: true });
  } catch {
    return c.json({ error: 'Daily records could not be deleted. Try again later.' }, 503);
  }
});
