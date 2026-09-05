import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { savedJobs, applications } from '../../../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

async function ensureSavedJobsTableExists(db: any) {
  try {
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS saved_jobs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        job_posting_id TEXT NOT NULL,
        job_data TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);
  } catch (err) {
    console.error('Error ensuring saved_jobs table exists:', err);
  }
}

export const GET: APIRoute = async ({ locals }) => {
  try {
    const user = locals.user;
    if (!user || user.userType !== 'employee') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const db = getDb();
    await ensureSavedJobsTableExists(db);

    const rows = await db.select().from(savedJobs)
      .where(eq(savedJobs.userId, user.userId))
      .orderBy(desc(savedJobs.createdAt));

    const list = rows.map((r: any) => {
      if (r.jobData) {
        if (typeof r.jobData === 'string') {
          try { return JSON.parse(r.jobData); } catch { return { id: r.jobPostingId }; }
        }
        return r.jobData;
      }
      return { id: r.jobPostingId };
    });

    const userApps = await db.select({ jobPostingId: applications.jobPostingId })
      .from(applications)
      .where(eq(applications.applicantId, user.userId))
      .all();
    const appliedJobIds = userApps.map((a: any) => a.jobPostingId);

    return new Response(JSON.stringify({ success: true, savedJobs: list, appliedJobIds }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Server error' }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user || user.userType !== 'employee') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const data = await request.json().catch(() => ({}));
    const { action, jobId, jobData } = data;

    if (!jobId) {
      return new Response(JSON.stringify({ error: 'jobId is required' }), { status: 400 });
    }

    const db = getDb();
    await ensureSavedJobsTableExists(db);

    if (action === 'remove') {
      await db.delete(savedJobs)
        .where(and(
          eq(savedJobs.userId, user.userId),
          eq(savedJobs.jobPostingId, jobId)
        ));
    } else {
      const existing = await db.select().from(savedJobs)
        .where(and(
          eq(savedJobs.userId, user.userId),
          eq(savedJobs.jobPostingId, jobId)
        ));

      if (existing.length === 0) {
        const id = crypto.randomUUID();
        const payloadData = jobData || { id: jobId, jobTitle: 'Saved Position' };
        await db.insert(savedJobs).values({
          id,
          userId: user.userId,
          jobPostingId: jobId,
          jobData: typeof payloadData === 'string' ? payloadData : JSON.stringify(payloadData),
        });
      }
    }

    const rows = await db.select().from(savedJobs)
      .where(eq(savedJobs.userId, user.userId))
      .orderBy(desc(savedJobs.createdAt));

    const updatedList = rows.map((r: any) => {
      if (r.jobData) {
        if (typeof r.jobData === 'string') {
          try { return JSON.parse(r.jobData); } catch { return { id: r.jobPostingId }; }
        }
        return r.jobData;
      }
      return { id: r.jobPostingId };
    });

    return new Response(JSON.stringify({
      success: true,
      message: action === 'remove' ? 'Job removed from saved' : 'Job saved successfully',
      savedJobs: updatedList
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Server error' }), { status: 500 });
  }
};
