import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { users } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // @ts-ignore
    const adminUser = locals.user;
    
    // Safety check - though middleware should catch this
    if (adminUser.userType !== 'admin' && adminUser.userType !== 'superadmin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    const data = await request.json();
    const { targetUserId, action } = data; // action: 'verify' or 'reject'

    if (!targetUserId || !['verify', 'reject'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
    }

    const db = getDb();

    const targetUser = await db.select().from(users).where(eq(users.id, targetUserId)).get();
    
    if (!targetUser) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
    }

    const newStatus = action === 'verify' ? 'verified' : 'rejected';

    await db.update(users)
      .set({ 
        verifiedStatus: newStatus,
        verifiedAt: new Date(),
        verifiedBy: adminUser.userId
      })
      .where(eq(users.id, targetUserId));

    return new Response(JSON.stringify({ 
      success: true, 
      message: `User successfully ${newStatus}.` 
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { status: 500 });
  }
};
