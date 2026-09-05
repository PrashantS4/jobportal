import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { interviews } from '../../../db/schema';
import { eq, and, sql } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // @ts-ignore
    const user = locals.user;
    if (!user || user.userType !== 'employee') {
      return new Response(JSON.stringify({ error: 'Unauthorized. Candidates only.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json().catch(() => ({}));
    const { interviewId } = body;

    if (!interviewId) {
      return new Response(JSON.stringify({ error: 'Invalid interviewId provided.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = getDb();

    // Ensure candidate_deleted column exists in D1 database
    try {
      await db.run(sql`ALTER TABLE interviews ADD COLUMN candidate_deleted INTEGER DEFAULT 0`);
    } catch (e) {
      // Column already exists
    }

    // Verify interview belongs to candidate
    const existing = await db.select()
      .from(interviews)
      .where(and(
        eq(interviews.id, interviewId),
        eq(interviews.candidateId, user.userId)
      ))
      .get();

    if (!existing) {
      return new Response(JSON.stringify({ error: 'Interview not found or unauthorized.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Soft delete for candidate history view only
    await db.update(interviews)
      .set({
        candidateDeleted: true,
        updatedAt: new Date()
      })
      .where(eq(interviews.id, interviewId));

    return new Response(JSON.stringify({
      success: true,
      message: 'Interview removed from your history.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error deleting past interview for candidate:', error);
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
