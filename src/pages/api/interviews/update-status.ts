import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { interviews, applications, notifications } from '../../../db/schema';
import { eq, and, or } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json().catch(() => ({}));
    const { interviewId, status } = body;

    if (!interviewId || !status || !['scheduled', 'completed', 'cancelled', 'rescheduled'].includes(status)) {
      return new Response(JSON.stringify({ error: 'Invalid interviewId or status provided.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = getDb();

    // Verify user is either employer or candidate for this interview
    const existing = await db.select()
      .from(interviews)
      .where(and(
        eq(interviews.id, interviewId),
        or(
          eq(interviews.employerId, user.userId),
          eq(interviews.candidateId, user.userId)
        )
      ))
      .get();

    if (!existing) {
      return new Response(JSON.stringify({ error: 'Interview not found or unauthorized.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await db.update(interviews)
      .set({
        status,
        updatedAt: new Date()
      })
      .where(eq(interviews.id, interviewId));

    // If employer marked as completed, we can also record that
    if (status === 'completed' && user.userType === 'employer') {
      try {
        await db.insert(notifications).values({
          id: crypto.randomUUID(),
          userId: existing.candidateId,
          title: `✓ Interview Completed: ${existing.title}`,
          message: `Your interview for "${existing.title}" has been marked as completed. The employer is reviewing your application.`,
          type: 'alert',
          isRead: false,
          createdAt: new Date()
        });
      } catch (e) {
        console.error('Failed to notify candidate of completion:', e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Interview status updated to ${status}`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error updating interview status:', error);
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
