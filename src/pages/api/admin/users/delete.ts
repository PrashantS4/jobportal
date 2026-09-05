import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { users, applications, notifications, recommendations, jobSearches, userBehavior } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  // @ts-ignore
  const user = locals.user;

  if (!user || (user.userType !== 'admin' && user.userType !== 'superadmin' && user.userType !== 'masteradmin')) {
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
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
    }

    // Role Hierarchy Enforcement: Only MasterAdmin can delete a MasterAdmin account
    if (targetUser.userType === 'masteradmin' && user.userType !== 'masteradmin') {
      return new Response(JSON.stringify({ error: 'Forbidden: Only MasterAdmin can delete a MasterAdmin account' }), { status: 403 });
    }

    // Delete candidate applications
    await db.delete(applications).where(eq(applications.applicantId, userId));
    // Delete candidate recommendations
    await db.delete(recommendations).where(eq(recommendations.employeeId, userId));
    // Delete candidate searches & behavior
    await db.delete(jobSearches).where(eq(jobSearches.employeeId, userId));
    await db.delete(userBehavior).where(eq(userBehavior.userId, userId));
    // Delete notifications
    await db.delete(notifications).where(eq(notifications.userId, userId));
    // Delete user record
    await db.delete(users).where(eq(users.id, userId));

    return new Response(JSON.stringify({ success: true, message: 'Account and associated records deleted permanently.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error deleting account:', error);
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
