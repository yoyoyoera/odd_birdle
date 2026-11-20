import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { createPost } from '../core/post';
import { postTodaysDaily } from '../core/dailyPost';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const post = await createPost();

    return c.json<UiResponse>(
      {
        navigateTo: `https://reddit.com/comments/${post.id}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>(
      {
        showToast: 'Failed to create post',
      },
      400
    );
  }
});

// A moderator can post today's daily by hand (a day gets one post: asking again does nothing).
menu.post('/post-daily', async (c) => {
  try {
    const result = await postTodaysDaily();
    if (result.posted) return c.json<UiResponse>({ navigateTo: `https://reddit.com/comments/${result.postId}` }, 200);
    return c.json<UiResponse>({ showToast: result.reason === 'already' ? "Today's daily is already posted." : 'Could not post the daily.' }, 200);
  } catch (error) {
    console.error(`Error posting the daily: ${error}`);
    return c.json<UiResponse>({ showToast: 'Could not post the daily.' }, 400);
  }
});
