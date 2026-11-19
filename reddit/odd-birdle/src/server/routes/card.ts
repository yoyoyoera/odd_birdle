import { Hono } from 'hono';
import { context, media, reddit } from '@devvit/web/server';
import { RichTextBuilder } from '@devvit/shared-types/richtext/RichTextBuilder.js';

// POST /api/card: the player's full-time card, posted as a comment on this post under their own name.
// Tries a picture first; if Reddit will not take the picture (or the comment with it), the same card goes up as text.
export const card = new Hono();

type CardBody = { image?: string; text?: string };

card.post('/', async (c) => {
  const { image, text } = await c.req.json<CardBody>();
  const postId = context.postId;
  if (!postId || !text) return c.json({ ok: false, error: 'missing post or text' }, 400);

  let imageError = '';
  if (image) {
    try {
      const asset = await media.upload({ url: image, type: 'image' });
      const richtext = new RichTextBuilder()
        .image({ mediaUrl: asset.mediaUrl })
        .paragraph((p) => { p.text({ text }); });
      const comment = await reddit.submitComment({ id: postId, richtext, runAs: 'USER' });
      return c.json({ ok: true, mode: 'image', url: comment.permalink });
    } catch (error) {
      imageError = String(error);
      console.error('card image comment failed:', imageError);
    }
  }
  try {
    const comment = await reddit.submitComment({ id: postId, text, runAs: 'USER' });
    return c.json({ ok: true, mode: 'text', url: comment.permalink, imageError });
  } catch (error) {
    console.error('card text comment failed:', String(error));
    return c.json({ ok: false, error: String(error), imageError }, 500);
  }
});
