import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { users } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  // @ts-ignore
  const user = locals.user;

  if (!user || (user.userType !== 'admin' && user.userType !== 'superadmin' && user.userType !== 'masteradmin')) {
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
      phone, 
      headline, 
      bio, 
      location, 
      experienceYears, 
      skills, 
      linkedinUrl, 
      portfolioUrl, 
      verifiedStatus, 
      isActive,
      planId
    } = data;

    if (!userId || !firstName || !lastName) {
      return new Response(JSON.stringify({ error: 'User ID, First Name, and Last Name are required' }), { status: 400 });
    }

    const db = getDb();
    const targetUser = await db.select().from(users).where(eq(users.id, userId)).get();

    if (!targetUser) {
      return new Response(JSON.stringify({ error: 'User profile not found' }), { status: 404 });
    }

    // Role Hierarchy Enforcement: Only MasterAdmin can modify a MasterAdmin account
    if (targetUser.userType === 'masteradmin' && user.userType !== 'masteradmin') {
      return new Response(JSON.stringify({ error: 'Forbidden: Only MasterAdmin can edit a MasterAdmin account' }), { status: 403 });
    }

    let parsedSkills = skills;
    if (typeof skills === 'string') {
      try {
        parsedSkills = skills.split(',').map((s: string) => s.trim()).filter(Boolean);
      } catch (e) {
        parsedSkills = [skills];
      }
    }

    await db.update(users)
      .set({
        firstName,
        lastName,
        phone: phone || null,
        headline: headline || null,
        bio: bio || null,
        location: location || null,
        experienceYears: experienceYears ? parseInt(experienceYears) : null,
        skills: JSON.stringify(parsedSkills),
        linkedinUrl: linkedinUrl || null,
        portfolioUrl: portfolioUrl || null,
        verifiedStatus: verifiedStatus || targetUser.verifiedStatus,
        isActive: isActive !== undefined ? (isActive === 'true' || isActive === true) : targetUser.isActive,
        planId: planId === '' ? null : (planId || targetUser.planId)
      })
      .where(eq(users.id, userId));

    return new Response(JSON.stringify({ success: true, message: 'User profile updated successfully' }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error updating user profile:', error);
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
