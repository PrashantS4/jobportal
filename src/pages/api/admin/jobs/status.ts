import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { jobPostings } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  // @ts-ignore
  const user = locals.user;

  if (!user || (user.userType !== 'admin' && user.userType !== 'superadmin')) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Admin privileges required' }), { status: 401 });
  }

  try {
    const data = await request.json();
    const { jobId, status } = data;

    if (!jobId || !['published', 'draft', 'closed'].includes(status)) {
      return new Response(JSON.stringify({ error: 'Invalid jobId or status' }), { status: 400 });
    }

    const db = getDb();

    const existingJob = await db.select().from(jobPostings).where(eq(jobPostings.id, jobId)).get();
    if (!existingJob) {
      return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404 });
    }

    await db.update(jobPostings)
      .set({ status })
      .where(eq(jobPostings.id, jobId));

    return new Response(JSON.stringify({ success: true, message: 'Status updated successfully' }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
