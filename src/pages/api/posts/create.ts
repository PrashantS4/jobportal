import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { posts } from '../../../db/schema';
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // @ts-ignore
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await request.json();
    const { content, mediaUrl, mediaType } = body;

    if (!content) {
      return new Response(JSON.stringify({ error: 'Content is required' }), { status: 400 });
    }

    const postId = crypto.randomUUID();

    const db = getDb();
    await db.insert(posts).values({
      id: postId,
      authorId: user.userId,
      content,
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      status: 'published',
    });

    return new Response(JSON.stringify({ success: true, postId }), { status: 201 });
  } catch (error) {
    console.error('Error creating post:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
