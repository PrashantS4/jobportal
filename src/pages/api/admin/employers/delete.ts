import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { users, jobPostings, applications, notifications, recommendations } from '../../../../db/schema';
import { eq, inArray } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  // @ts-ignore
  const user = locals.user;

  if (!user || (user.userType !== 'admin' && user.userType !== 'superadmin')) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Admin access required' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await request.json();
    const { userId } = data;

    if (!userId) {
      return new Response(JSON.stringify({ error: 'User ID is required' }), { status: 400 });
    }

    const db = getDb();
    const targetUser = await db.select().from(users).where(eq(users.id, userId)).get();

    if (!targetUser) {
      return new Response(JSON.stringify({ error: 'Employer account not found' }), { status: 404 });
    }

    // Find all job postings created by this employer
    const employerJobs = await db.select({ id: jobPostings.id })
      .from(jobPostings)
      .where(eq(jobPostings.employerId, userId))
      .all();

    const jobIds = employerJobs.map(j => j.id);

    if (jobIds.length > 0) {
      // Delete applications for employer's jobs
      await db.delete(applications).where(inArray(applications.jobPostingId, jobIds));
      // Delete recommendations for employer's jobs
      await db.delete(recommendations).where(inArray(recommendations.jobPostingId, jobIds));
      // Delete job postings
      await db.delete(jobPostings).where(eq(jobPostings.employerId, userId));
    }

    // Delete employer notifications
    await db.delete(notifications).where(eq(notifications.userId, userId));

    // Delete employer user record
    await db.delete(users).where(eq(users.id, userId));

    return new Response(JSON.stringify({ success: true, message: 'Employer account and all associated jobs deleted permanently.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error deleting employer account:', error);
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
