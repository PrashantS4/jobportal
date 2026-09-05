import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { users } from '../../../db/schema';
import { hashPassword, verifyResetToken } from '../../../lib/auth';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return new Response(JSON.stringify({ error: 'Token and new password are required' }), { status: 400 });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: 'Password must be at least 6 characters long' }), { status: 400 });
    }

    // Verify token and retrieve the email
    const email = await verifyResetToken(token);

    if (!email) {
      return new Response(JSON.stringify({ error: 'Invalid or expired reset token' }), { status: 400 });
    }

    const db = getDb();

    // Check if user still exists
    const user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
      return new Response(JSON.stringify({ error: 'User account not found' }), { status: 404 });
    }

    // Hash the new password (12 rounds)
    const passwordHash = await hashPassword(password);

    // Update the password in the database
    await db.update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.email, email))
      .run();

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Password has been reset successfully. You can now log in.' 
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { status: 500 });
  }
};
