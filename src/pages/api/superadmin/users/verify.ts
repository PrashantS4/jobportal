import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { users } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ locals, request, redirect }) => {
  // @ts-ignore
  if (!locals.user || (locals.user.userType !== 'superadmin' && locals.user.userType !== 'admin')) {
    return new Response('Unauthorized', { status: 403 });
  }

  const db = getDb();
  const formData = await request.formData();

  const userId = formData.get('userId')?.toString();
  const action = formData.get('action')?.toString(); // 'verify' or 'reject'

  if (!userId || !action) {
    return new Response('Missing required fields', { status: 400 });
  }

  let verifiedStatus = 'pending';
  if (action === 'verify') verifiedStatus = 'verified';
  if (action === 'reject') verifiedStatus = 'rejected';

  try {
    await db.update(users)
      .set({
        // @ts-ignore
        verifiedStatus: verifiedStatus,
      })
      .where(eq(users.id, userId));

    // Redirect back to the page that initiated the request
    const referer = request.headers.get('referer') || '/superadmin/users';
    return redirect(referer);
  } catch (error) {
    console.error('Failed to update user verification:', error);
    return new Response('Failed to update user', { status: 500 });
  }
};
