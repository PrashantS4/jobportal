import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { users } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, locals }) => {
  // @ts-ignore
  const user = locals.user;

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return new Response(JSON.stringify({ error: 'Both current and new passwords are required' }), { status: 400 });
    }

    if (newPassword.length < 8) {
      return new Response(JSON.stringify({ error: 'New password must be at least 8 characters' }), { status: 400 });
    }

    const db = getDb();
    const userRecord = await db.select().from(users).where(eq(users.id, user.userId)).get();

    if (!userRecord) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });
    }

    const passwordMatch = await verifyPassword(currentPassword, userRecord.passwordHash);
    if (!passwordMatch) {
      return new Response(JSON.stringify({ error: 'Current password is incorrect' }), { status: 400 });
    }

    const newHash = await hashPassword(newPassword);

    await db.update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, user.userId));

    return new Response(JSON.stringify({ success: true, message: 'Password changed successfully' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { status: 500 });
  }
};
