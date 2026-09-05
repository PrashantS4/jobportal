import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { users } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { verifyToken } from '../../../lib/auth';

export const GET: APIRoute = async ({ request, url }) => {
  const userType = url.searchParams.get('userType') || 'employee';
  const redirectUrl = userType === 'employer' ? '/employer' : '/dashboard';
  return new Response(null, {
    status: 302,
    headers: { 'Location': redirectUrl }
  });
};

export const POST: APIRoute = async ({ request, cookies, locals, url }) => {
  // @ts-ignore
  let user = locals?.user;
  
  if (!user) {
    const authHeader = request.headers.get('Authorization');
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else {
      token = cookies.get('auth_token')?.value;
    }

    if (token) {
      user = await verifyToken(token);
    }
  }
  
  let fallbackUserId = url.searchParams.get('userId');

  if (!user && !fallbackUserId) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Please log in to activate a plan' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const activeUserId = user ? user.userId : fallbackUserId;

  try {
    const contentType = request.headers.get('content-type') || '';
    let planId = 'P001';

    if (contentType.includes('application/json')) {
      const data = await request.json().catch(() => ({}));
      planId = data.planId || url.searchParams.get('planId') || 'P001';
    } else {
      const formData = await request.formData().catch(() => new FormData());
      const reqUrl = new URL(request.url);
      planId = reqUrl.searchParams.get('planId') || (formData.get('planId') as string) || 'P001';
    }

    const db = getDb();
    
    // Set plan to expire in 100 years
    const planExpiresAt = new Date();
    planExpiresAt.setFullYear(planExpiresAt.getFullYear() + 100);

    await db.update(users)
      .set({
        planId: planId,
        planExpiresAt: planExpiresAt,
        subscriptionStatus: 'active'
      })
      .where(eq(users.id, activeUserId));

    return new Response(JSON.stringify({ success: true, message: 'Plan activated successfully' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error activating plan:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
