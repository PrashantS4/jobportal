import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { posts, users } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';
export const GET: APIRoute = async ({ locals }) => {
  try {
    // @ts-ignore
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // Fetch posts along with author information, sorted by newest
    const db = getDb();
    const allPosts = await db
      .select({
        id: posts.id,
        content: posts.content,
        mediaUrl: posts.mediaUrl,
        mediaType: posts.mediaType,
        status: posts.status,
        createdAt: posts.createdAt,
        author: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          avatarUrl: users.avatarUrl,
          headline: users.headline,
          userType: users.userType
        }
      })
      .from(posts)
      .innerJoin(users, eq(posts.authorId, users.id))
      .where(eq(posts.status, 'published'))
      .orderBy(desc(posts.createdAt));

    return new Response(JSON.stringify({ posts: allPosts }), { status: 200 });
  } catch (error) {
    console.error('Error fetching posts:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};
