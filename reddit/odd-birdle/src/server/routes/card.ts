import { Hono } from 'hono';
import { context, media, reddit } from '@devvit/web/server';
import { RichTextBuilder } from '@devvit/shared-types/richtext/RichTextBuilder.js';
import { claimCard, getToday, releaseCard } from '../core/daily';
import { challengeNames } from '../../shared/daily-plan';

// POST /api/card: the player's full-time card, posted as a comment on this post under their own name.
// Tries a picture first; if Reddit will not take the picture (or the comment with it), the same card goes up as text.
// A DAILY card ({ daily: true }) is only posted for a clear the server has on record, and its words (day, challenge, time,
// place in the order) are written here from that record, never taken from the browser; the app then answers the comment
// with a "Verified" line, so a made-up card without it is easy to tell.
export const card = new Hono();

type CardBody = { image?: string; text?: string; daily?: boolean };
const maxImageLength = 4_000_000;

card.post('/', async (c) => {
  const body = await c.req.json<CardBody>();
  const postId = context.postId;
  const userId = context.userId;
  if (!postId) return c.json({ ok: false, error: 'missing post' }, 400);
  if (body.image && (typeof body.image !== 'string' || body.image.length > maxImageLength)) return c.json({ ok: false, error: 'bad image' }, 400);

  let text = typeof body.text === 'string' ? body.text.slice(0, 500) : '';
  let verified = '';
  let claimed: { userId: string; date: string } | undefined;
  if (body.daily) {
    if (!userId) return c.json({ ok: false, error: 'sign in' }, 401);
    const { cleared, plan } = await getToday(userId);
    if (!cleared) return c.json({ ok: false, error: 'No daily clear on record.' }, 403);
    // A clear has one card: asking twice (a second tap, another tab, a later visit) does not post it again.
    if (!(await claimCard(userId, plan.date))) return c.json({ ok: false, posted: true, error: 'This clear already has its card.' }, 409);
    claimed = { userId, date: plan.date };
    const name = challengeNames[plan.key] ?? plan.key;
    text = `Odd Birdle · Daily #${plan.number} (${plan.date}) · ${name} · cleared #${cleared.rank} of the day in ${cleared.seconds}s`;
    verified = `✓ Verified by Odd Birdle: Daily #${plan.number}, ${plan.date}. Clear #${cleared.rank} of the day, ${cleared.seconds}s.`;
  }
  if (!text) return c.json({ ok: false, error: 'missing text' }, 400);

  let imageError = '';
  let comment;
  let mode = 'text';
  if (body.image) {
    try {
      const asset = await media.upload({ url: body.image, type: 'image' });
      const richtext = new RichTextBuilder()
        .image({ mediaUrl: asset.mediaUrl })
        .paragraph((p) => { p.text({ text }); });
      comment = await reddit.submitComment({ id: postId, richtext, runAs: 'USER' });
      mode = 'image';
    } catch (error) {
      imageError = String(error);
      console.error('card image comment failed:', imageError);
    }
  }
  if (!comment) {
    try {
      comment = await reddit.submitComment({ id: postId, text, runAs: 'USER' });
    } catch (error) {
      console.error('card text comment failed:', String(error));
      if (claimed) await releaseCard(claimed.userId, claimed.date).catch(() => {});
      return c.json({ ok: false, error: String(error), imageError }, 500);
    }
  }
  if (verified) {
    try {
      await reddit.submitComment({ id: comment.id, text: verified, runAs: 'APP' });
    } catch (error) {
      console.error('verification reply failed:', String(error));
    }
  }
  return c.json({ ok: true, mode, url: comment.permalink, ...(imageError ? { imageError } : {}) });
});
