import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { users } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  // @ts-ignore
  const user = locals.user;

  if (!user || (user.userType !== 'admin' && user.userType !== 'superadmin')) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Admin access required' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const data = await request.json();
    const { 
      userId, 
      firstName, 
      lastName, 
      companyName, 
      companyWebsite, 
      companyIndustry, 
      companySize, 
      companyBio, 
      phone, 
      planId, 
      verifiedStatus, 
      isActive 
    } = data;

    if (!userId || !firstName || !lastName) {
      return new Response(JSON.stringify({ error: 'User ID, First Name, and Last Name are required' }), { status: 400 });
    }

    const db = getDb();
    const targetUser = await db.select().from(users).where(eq(users.id, userId)).get();

    if (!targetUser) {
      return new Response(JSON.stringify({ error: 'Employer account not found' }), { status: 404 });
    }

    await db.update(users)
      .set({
        firstName,
        lastName,
        companyName: companyName || null,
        companyWebsite: companyWebsite || null,
        companyIndustry: companyIndustry || null,
        companySize: companySize || null,
        companyBio: companyBio || null,
        phone: phone || null,
        planId: planId || 'P001',
        verifiedStatus: verifiedStatus || targetUser.verifiedStatus,
        isActive: isActive === true || isActive === 'true'
      })
      .where(eq(users.id, userId));

    return new Response(JSON.stringify({ success: true, message: 'Employer profile updated successfully' }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Error updating employer profile by admin:', error);
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
