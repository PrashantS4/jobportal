import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { jobPostings, users } from '../../../db/schema';
import { eq, and, like, or, desc } from 'drizzle-orm';

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get('search') || '';
    const employmentType = url.searchParams.get('type') || '';
    const remoteOnly = url.searchParams.get('remote') === 'true';
    const experienceLevel = url.searchParams.get('experience') || '';

    const db = getDb();

    // Fetch all published jobs with employer info
    const allJobs = await db
      .select({
        id: jobPostings.id,
        jobTitle: jobPostings.jobTitle,
        description: jobPostings.description,
        requirements: jobPostings.requirements,
        salaryMin: jobPostings.salaryMin,
        salaryMax: jobPostings.salaryMax,
        salaryCurrency: jobPostings.salaryCurrency,
        locationCity: jobPostings.locationCity,
        locationRemote: jobPostings.locationRemote,
        employmentType: jobPostings.employmentType,
        experienceLevel: jobPostings.experienceLevel,
        applicationsCount: jobPostings.applicationsCount,
        publishedAt: jobPostings.publishedAt,
        createdAt: jobPostings.createdAt,
        // Employer info
        companyName: users.companyName,
        companyIndustry: users.companyIndustry,
        employerId: users.id,
      })
      .from(jobPostings)
      .leftJoin(users, eq(jobPostings.employerId, users.id))
      .where(eq(jobPostings.status, 'published'))
      .orderBy(desc(jobPostings.publishedAt))
      .all();

    // Apply filters in JS (D1 local emulator can be finicky with complex where clauses)
    let filtered = allJobs;

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (j) =>
          j.jobTitle?.toLowerCase().includes(q) ||
          j.companyName?.toLowerCase().includes(q) ||
          j.locationCity?.toLowerCase().includes(q) ||
          j.description?.toLowerCase().includes(q)
      );
    }

    if (employmentType) {
      filtered = filtered.filter((j) => j.employmentType === employmentType);
    }

    if (remoteOnly) {
      filtered = filtered.filter((j) => j.locationRemote === true);
    }

    if (experienceLevel) {
      filtered = filtered.filter((j) => j.experienceLevel === experienceLevel);
    }

    return new Response(JSON.stringify({ jobs: filtered, total: filtered.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error fetching jobs:', error);
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
