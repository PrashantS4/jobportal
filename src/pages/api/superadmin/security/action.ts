import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { users, jobPostings, applications, posts, notifications } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  // @ts-ignore
  const currentUser = locals.user;

  if (!currentUser || (currentUser.userType !== 'superadmin' && currentUser.userType !== 'admin' && currentUser.userType !== 'masteradmin')) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Admin or Superadmin access required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await request.json();
    const { userId, action, reason } = data; // action: 'block' | 'unblock' | 'delete' | 'mark_safe'

    if (!userId || !action) {
      return new Response(JSON.stringify({ error: 'User ID and action are required' }), { status: 400 });
    }

    const db = getDb();
    const targetUser = await db.select().from(users).where(eq(users.id, userId)).get();

    if (!targetUser) {
      return new Response(JSON.stringify({ error: 'Target user not found' }), { status: 404 });
    }

    // Role Hierarchy Enforcement: Only MasterAdmin can modify a MasterAdmin account
    if (targetUser.userType === 'masteradmin' && currentUser.userType !== 'masteradmin') {
      return new Response(JSON.stringify({ error: 'Forbidden: Only MasterAdmin can modify a MasterAdmin account' }), { status: 403 });
    }

    // Protect superadmin from being modified by ordinary superadmin or admin
    if (targetUser.userType === 'superadmin' && currentUser.userType !== 'masteradmin' && currentUser.id !== targetUser.id) {
      return new Response(JSON.stringify({ error: 'Cannot modify another Superadmin account' }), { status: 403 });
    }

    if (action === 'block') {
      await db.update(users).set({ isActive: false }).where(eq(users.id, userId));

      // If employer, close all active jobs to immediately stop spam visibility
      if (targetUser.userType === 'employer') {
        await db.update(jobPostings).set({ status: 'closed' }).where(eq(jobPostings.employerId, userId));
      }

      // Add a security notification for the user
      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        userId: targetUser.id,
        title: 'Account Suspended for Security Review',
        message: reason || 'Your account has been temporarily suspended by security compliance for policy verification.',
        type: 'alert',
        isRead: false
      });

      return new Response(JSON.stringify({
        success: true,
        message: `Account "${targetUser.email}" has been blocked and restricted.`,
        isActive: false
      }), { status: 200 });

    } else if (action === 'unblock') {
      await db.update(users).set({ isActive: true }).where(eq(users.id, userId));

      return new Response(JSON.stringify({
        success: true,
        message: `Account "${targetUser.email}" has been reactivated.`,
        isActive: true
      }), { status: 200 });

    } else if (action === 'mark_safe') {
      await db.update(users).set({
        verifiedStatus: 'verified',
        verifiedAt: new Date(),
        verifiedBy: currentUser.userId || currentUser.id
      }).where(eq(users.id, userId));

      return new Response(JSON.stringify({
        success: true,
        message: `Account "${targetUser.email}" verified and marked safe.`,
        verifiedStatus: 'verified'
      }), { status: 200 });

    } else if (action === 'delete') {
      // Cascade delete user data
      if (targetUser.userType === 'employer') {
        await db.delete(jobPostings).where(eq(jobPostings.employerId, userId));
        await db.delete(applications).where(eq(applications.employerId, userId));
      } else if (targetUser.userType === 'employee') {
        await db.delete(applications).where(eq(applications.applicantId, userId));
      }

      await db.delete(posts).where(eq(posts.authorId, userId));
      await db.delete(notifications).where(eq(notifications.userId, userId));
      await db.delete(users).where(eq(users.id, userId));

      return new Response(JSON.stringify({
        success: true,
        message: `Account "${targetUser.email}" and all associated records permanently purged.`
      }), { status: 200 });

    } else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
    }

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Action failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
