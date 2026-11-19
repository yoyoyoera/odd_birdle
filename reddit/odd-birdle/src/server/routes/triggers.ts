import { context } from '@devvit/web/server';
import { Hono } from 'hono';
import type { OnAppInstallRequest, OnPostDeleteRequest, TriggerResponse } from '@devvit/web/shared';

import { createPost } from '../core/post';
import { deletePostStageProgress } from '../core/stages';

export const triggers = new Hono();

triggers.post('/on-post-delete', async (c) => {
  try {
    const input = await c.req.json<OnPostDeleteRequest>();
    if (!input.postId) return c.json({ status: 'error' }, 400);
    await deletePostStageProgress(input.postId);
    return c.json<TriggerResponse>({ status: 'success' });
  } catch {
    return c.json<TriggerResponse>({ status: 'error', message: 'Failed to delete post progress' }, 500);
  }
});

triggers.post('/on-app-install', async (c) => {
  try {
    const post = await createPost();

    const input = await c.req.json<OnAppInstallRequest>();

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Post created in subreddit ${context.subredditName} with id ${post.id} (trigger: ${input.type})`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to create post',
      },
      400
    );
  }
});
