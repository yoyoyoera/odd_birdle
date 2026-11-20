import { context } from '@devvit/web/server';
import { Hono } from 'hono';
import { deletePrefs, getPrefs, setPadGain } from '../core/prefs';

export const prefs = new Hono();

prefs.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  if (!context.userId) return c.json({ error: 'Sign in to keep your settings.' }, 401);
  await next();
});

prefs.get('/', async (c) => {
  try { return c.json(await getPrefs(context.userId as string)); } catch { return c.json({ error: 'Settings are temporarily unavailable.' }, 503); }
});

prefs.post('/', async (c) => {
  let input: { padGain?: unknown };
  try { input = await c.req.json(); } catch { return c.json({ error: 'Invalid settings.' }, 400); }
  try {
    const saved = await setPadGain(context.userId as string, input.padGain);
    return saved ? c.json(saved) : c.json({ error: 'Invalid sensitivity.' }, 400);
  } catch { return c.json({ error: 'Settings could not be saved.' }, 503); }
});

prefs.delete('/', async (c) => {
  try { await deletePrefs(context.userId as string); return c.json({ ok: true }); } catch { return c.json({ error: 'Settings could not be deleted.' }, 503); }
});
