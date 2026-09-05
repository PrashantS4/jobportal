import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { jobPostings } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  // @ts-ignore
  const user = locals.user;

  if (!user || (user.userType !== 'admin' && user.userType !== 'superadmin')) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Admin privileges required' }), { status: 401 });
  }

  try {
    const data = await request.json();
    const { 
      jobId, 
      jobTitle, 
      description, 
      employmentType, 
      experienceLevel, 
      locationCity, 
      locationRemote, 
      salaryMin, 
      salaryMax, 
      salaryCurrency,
      status,
      applicationFormConfig
    } = data;

    if (!jobId || !jobTitle || !description) {
      return new Response(JSON.stringify({ error: 'Job ID, title, and description are required' }), { status: 400 });
    }

    const db = getDb();

    const existingJob = await db.select().from(jobPostings).where(eq(jobPostings.id, jobId)).get();
    if (!existingJob) {
      return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404 });
    }

    const updatePayload: Record<string, any> = {
      jobTitle,
      description,
      employmentType: employmentType || null,
      experienceLevel: experienceLevel || null,
      locationCity: locationCity || null,
      locationRemote: locationRemote === true,
      salaryMin: salaryMin && !isNaN(parseFloat(salaryMin)) ? parseFloat(salaryMin) : null,
      salaryMax: salaryMax && !isNaN(parseFloat(salaryMax)) ? parseFloat(salaryMax) : null,
      salaryCurrency: salaryCurrency || 'USD'
    };

    if (applicationFormConfig !== undefined) {
      updatePayload.applicationFormConfig = typeof applicationFormConfig === 'string' ? applicationFormConfig : JSON.stringify(applicationFormConfig);
    }

    if (status && ['published', 'draft', 'closed'].includes(status)) {
      updatePayload.status = status;
    }

    await db.update(jobPostings)
      .set(updatePayload)
      .where(eq(jobPostings.id, jobId));

    return new Response(JSON.stringify({ success: true, message: 'Job updated successfully by administrator' }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Admin job update error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
