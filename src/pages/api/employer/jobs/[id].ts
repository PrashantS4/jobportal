import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { jobPostings, users } from '../../../../db/schema';
import { eq, and } from 'drizzle-orm';

export const DELETE: APIRoute = async ({ params, locals }) => {
  // @ts-ignore
  const user = locals.user;
  const jobId = params.id;

  if (!user || user.userType !== 'employer') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!jobId) {
    return new Response(JSON.stringify({ error: 'Job ID is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const db = getDb();

    // Verify the employer owns the job
    const job = await db.select().from(jobPostings)
      .where(and(eq(jobPostings.id, jobId), eq(jobPostings.employerId, user.userId)))
      .get();

    if (!job) {
      return new Response(JSON.stringify({ error: 'Job not found or unauthorized' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Soft delete the job
    await db.update(jobPostings)
      .set({ isDeleted: true })
      .where(eq(jobPostings.id, jobId));

    return new Response(JSON.stringify({ message: 'Job deleted successfully' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error deleting job:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
