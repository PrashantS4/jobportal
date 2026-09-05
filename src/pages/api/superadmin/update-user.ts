import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { users } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const adminUser = locals.user;
    if (!adminUser || (adminUser.userType !== 'superadmin' && adminUser.userType !== 'admin' && adminUser.userType !== 'masteradmin')) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Admin access required' }), { status: 403 });
    }

    const data = await request.json();
    const { userId, firstName, lastName, userType, verifiedStatus, isActive } = data;

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing userId' }), { status: 400 });
    }

    const db = getDb();
    const targetUser = await db.select().from(users).where(eq(users.id, userId)).get();

    if (!targetUser) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
    }

    // Role Hierarchy Enforcement: Only masteradmin can modify a masteradmin account
    if (targetUser.userType === 'masteradmin' && adminUser.userType !== 'masteradmin') {
      return new Response(JSON.stringify({ error: 'Forbidden: Only MasterAdmin can edit a MasterAdmin account' }), { status: 403 });
    }

    // Only masteradmin can assign the masteradmin role
    if (userType === 'masteradmin' && adminUser.userType !== 'masteradmin') {
      return new Response(JSON.stringify({ error: 'Forbidden: Only MasterAdmin can assign the MasterAdmin role' }), { status: 403 });
    }

    // Build update payload
    const updateData: any = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (userType) updateData.userType = userType;
    if (verifiedStatus) updateData.verifiedStatus = verifiedStatus;
    if (isActive !== undefined) updateData.isActive = isActive;

    await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId));

    return new Response(JSON.stringify({ success: true, message: 'User updated successfully' }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { status: 500 });
  }
};
