import { context } from '@devvit/web/server';
import { Hono } from 'hono';
import { clearStage, deleteStageProgress, getStageProgress, isStageNumber } from '../core/stages';

export const stages = new Hono();

stages.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  if (!context.userId) return c.json({ error: 'Sign in to save stage progress.' }, 401);
  await next();
});

stages.get('/', async (c) => {
  const userId = context.userId;
  if (!userId) return c.json({ error: 'Sign in to save stage progress.' }, 401);
  try {
    return c.json({ cleared: await getStageProgress(userId), userId });
  } catch {
    return c.json({ error: 'Progress is temporarily unavailable.' }, 503);
  }
});

stages.post('/', async (c) => {
  const userId = context.userId;
  const postId = context.postId;
  if (!userId) return c.json({ error: 'Sign in to save stage progress.' }, 401);
  if (!postId) return c.json({ error: 'Open the game from a Reddit post.' }, 400);
  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid stage.' }, 400);
  }
  if (typeof input !== 'object' || input === null || !('stage' in input) || !isStageNumber(input.stage)) {
    return c.json({ error: 'Invalid stage.' }, 400);
  }
  try {
    const cleared = await clearStage(userId, postId, input.stage);
    if (!cleared) return c.json({ error: 'Clear stages 1–20 before the hidden stage.' }, 409);
    return c.json({ cleared, userId });
  } catch {
    return c.json({ error: 'Progress could not be saved. Try again later.' }, 503);
  }
});

stages.delete('/', async (c) => {
  const userId = context.userId;
  if (!userId) return c.json({ error: 'Sign in to manage stage progress.' }, 401);
  try {
    await deleteStageProgress(userId);
    return c.json({ cleared: [], userId });
  } catch {
    return c.json({ error: 'Progress could not be deleted. Try again later.' }, 503);
  }
});
