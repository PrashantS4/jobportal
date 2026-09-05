import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { notifications, applications } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const data = await request.json().catch(() => ({}));
    const { notificationId, applicationId, all } = data;

    const db = getDb();

    if (all) {
      // 1. Mark all system notifications for this user as read
      await db.update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.userId, user.userId));

      // 2. If employer, also mark all 'received' applications as 'under_review' so they count as read
      if (user.userType === 'employer') {
        await db.update(applications)
          .set({ status: 'under_review' })
          .where(and(
            eq(applications.employerId, user.userId),
            eq(applications.status, 'received')
          ));
      }

      return new Response(JSON.stringify({ success: true, message: 'All notifications marked as read' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Mark specific application as read (for employer)
    if (applicationId && user.userType === 'employer') {
      await db.update(applications)
        .set({ status: 'under_review' })
        .where(and(
          eq(applications.id, applicationId),
          eq(applications.employerId, user.userId),
          eq(applications.status, 'received')
        ));

      return new Response(JSON.stringify({ success: true, message: 'Application notification marked as read' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (notificationId) {
      // Update the single notification if it belongs to the logged-in user
      await db.update(notifications)
        .set({ isRead: true })
        .where(and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, user.userId)
        ));

      return new Response(JSON.stringify({ success: true }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Missing notificationId, applicationId, or all parameter' }), { status: 400 });

  } catch (error: any) {
    console.error('Error in /api/notifications/read:', error);
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { status: 500 });
  }
};

