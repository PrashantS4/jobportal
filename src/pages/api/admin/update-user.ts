import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { users } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // @ts-ignore
    const adminUser = locals.user;
    if (!adminUser || (adminUser.userType !== 'admin' && adminUser.userType !== 'superadmin')) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Admin access required' }), { 
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await request.json();
    const { userId, firstName, lastName, userType, verifiedStatus, isActive } = data;

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing userId' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const db = getDb();
    
    // Build update payload
    const updateData: any = {};
    if (firstName) updateData.firstName = firstName.trim();
    if (lastName) updateData.lastName = lastName.trim();
    if (userType) updateData.userType = userType;
    if (verifiedStatus) updateData.verifiedStatus = verifiedStatus;
    if (isActive !== undefined) updateData.isActive = isActive === true || isActive === 'true';
    updateData.updatedAt = new Date();

    await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId));

    return new Response(JSON.stringify({ success: true, message: 'User updated successfully' }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
