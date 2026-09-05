import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { users } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

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
    const { userId, action } = data; // action: 'block' | 'unblock' | 'verify' | 'reject'

    if (!userId || !action) {
      return new Response(JSON.stringify({ error: 'User ID and action are required' }), { status: 400 });
    }

    const db = getDb();
    const targetUser = await db.select().from(users).where(eq(users.id, userId)).get();

    if (!targetUser) {
      return new Response(JSON.stringify({ error: 'Employer not found' }), { status: 404 });
    }

    const updates: Record<string, any> = {};

    if (action === 'block') {
      updates.isActive = false;
    } else if (action === 'unblock') {
      updates.isActive = true;
    } else if (action === 'verify') {
      updates.verifiedStatus = 'verified';
      updates.verifiedAt = new Date();
      updates.verifiedBy = user.userId;
    } else if (action === 'reject') {
      updates.verifiedStatus = 'rejected';
    } else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
    }

    await db.update(users).set(updates).where(eq(users.id, userId));

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Employer ${action}ed successfully`,
      isActive: updates.isActive ?? targetUser.isActive,
      verifiedStatus: updates.verifiedStatus ?? targetUser.verifiedStatus
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Employer status update error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
