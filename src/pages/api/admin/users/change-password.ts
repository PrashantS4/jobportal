import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { users } from '../../../../db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../../../../lib/auth';

export const POST: APIRoute = async ({ request, locals }) => {
  // @ts-ignore
  const user = locals.user;

  if (!user || (user.userType !== 'superadmin' && user.userType !== 'masteradmin')) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Only Superadmin or MasterAdmin can change account passwords' }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await request.json();
    const { userId, newPassword } = data;

    if (!userId || !newPassword) {
      return new Response(JSON.stringify({ error: 'User ID and New Password are required' }), { status: 400 });
    }

    if (newPassword.length < 6) {
      return new Response(JSON.stringify({ error: 'New password must be at least 6 characters long' }), { status: 400 });
    }

    const db = getDb();
    const targetUser = await db.select().from(users).where(eq(users.id, userId)).get();

    if (!targetUser) {
      return new Response(JSON.stringify({ error: 'Account not found' }), { status: 404 });
    }

    // Role Hierarchy Enforcement: Only MasterAdmin can change password of a MasterAdmin account
    if (targetUser.userType === 'masteradmin' && user.userType !== 'masteradmin') {
      return new Response(JSON.stringify({ error: 'Forbidden: Only MasterAdmin can change password of a MasterAdmin account' }), { status: 403 });
    }

    const hashedPassword = await hashPassword(newPassword);

    await db.update(users)
      .set({ passwordHash: hashedPassword })
      .where(eq(users.id, userId));

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Password for ${targetUser.firstName} ${targetUser.lastName} (${targetUser.email}) updated successfully!` 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error updating password by admin:', error);
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
