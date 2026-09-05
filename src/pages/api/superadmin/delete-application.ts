import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { applications } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  // Check auth
  const user = (locals as any).user;
  if (!user || user.userType !== 'superadmin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const data = await request.json();
    const { id } = data;

    if (!id) {
      return new Response(JSON.stringify({ error: 'Application ID is required' }), { status: 400 });
    }

    // Delete the application
    const db = getDb();
    await db.delete(applications).where(eq(applications.id, id));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error deleting application:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete application' }), { status: 500 });
  }
};
