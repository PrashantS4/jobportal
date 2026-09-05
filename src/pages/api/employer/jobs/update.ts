import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { jobPostings } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  // @ts-ignore
  const user = locals.user;

  if (!user || user.userType !== 'employer') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
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
      applicationFormConfig
    } = data;

    if (!jobId || !jobTitle || !description) {
      return new Response(JSON.stringify({ error: 'Job ID, title and description are required' }), { status: 400 });
    }

    const db = getDb();

    // Verify job belongs to employer
    const job = await db.select().from(jobPostings).where(eq(jobPostings.id, jobId)).get();
    if (!job || job.employerId !== user.userId) {
      return new Response(JSON.stringify({ error: 'Job not found or forbidden' }), { status: 403 });
    }

    await db.update(jobPostings)
      .set({
        jobTitle,
        description,
        employmentType: employmentType || null,
        experienceLevel: experienceLevel || null,
        locationCity: locationCity || null,
        locationRemote: locationRemote === true,
        salaryMin: salaryMin && !isNaN(parseFloat(salaryMin)) ? parseFloat(salaryMin) : null,
        salaryMax: salaryMax && !isNaN(parseFloat(salaryMax)) ? parseFloat(salaryMax) : null,
        salaryCurrency: salaryCurrency || 'USD',
        applicationFormConfig: applicationFormConfig !== undefined 
          ? (typeof applicationFormConfig === 'string' ? applicationFormConfig : JSON.stringify(applicationFormConfig)) 
          : job.applicationFormConfig
      })
      .where(eq(jobPostings.id, jobId));

    return new Response(JSON.stringify({ message: 'Job updated successfully' }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { status: 500 });
  }
};
