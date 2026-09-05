import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { posts, users } from '../../../db/schema';
import { eq } from 'drizzle-orm';
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // @ts-ignore
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await request.json();
    const { postId, action } = body; // action: 'draft', 'delete'

    if (!postId || !action) {
      return new Response(JSON.stringify({ error: 'Post ID and action are required' }), { status: 400 });
    }

    const db = getDb();
    // Fetch the post
    const post = await db.select().from(posts).where(eq(posts.id, postId)).get();

    if (!post) {
      return new Response(JSON.stringify({ error: 'Post not found' }), { status: 404 });
    }

    // Check permissions
    const isAuthor = post.authorId === user.id;
    const isAdmin = user.userType === 'admin' || user.userType === 'superadmin';

    if (!isAuthor && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    if (action === 'delete') {
      await db.delete(posts).where(eq(posts.id, postId));
    } else if (action === 'draft') {
      await db.update(posts).set({ status: 'draft' }).where(eq(posts.id, postId));
    } else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    console.error('Error managing post:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
