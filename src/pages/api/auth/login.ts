import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { users } from '../../../db/schema';
import { verifyPassword, signToken } from '../../../lib/auth';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const data = await request.json();
    const { email, password } = data;

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password required' }), { status: 400 });
    }

    const db = getDb();

    const user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
    }

    if (!user.isActive) {
      return new Response(JSON.stringify({ error: 'Account is deactivated' }), { status: 403 });
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
    }

    // Note: SRS requires account verification to use platform features, 
    // but they can still log in to see their "pending" status.

    // Generate JWT
    const token = await signToken({
      userId: user.id,
      userType: user.userType as 'employee' | 'employer' | 'admin' | 'superadmin' | 'masteradmin',
      verifiedStatus: user.verifiedStatus as 'pending' | 'verified' | 'rejected'
    });

    return new Response(JSON.stringify({ 
      success: true, 
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
        verifiedStatus: user.verifiedStatus,
        planId: user.planId
      }
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { status: 500 });
  }
};
