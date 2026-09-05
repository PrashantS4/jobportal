import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { applications, jobPostings, users } from '../../../db/schema';
import { eq, desc } from 'drizzle-orm';

export const GET: APIRoute = async ({ locals }) => {
  try {
    // @ts-ignore
    const user = locals.user;
    if (!user || user.userType !== 'employee') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const db = getDb();

    const userApps = await db
      .select({
        id: applications.id,
        status: applications.status,
        coverLetter: applications.coverLetter,
        resumeUrl: applications.resumeUrl,
        appliedAt: applications.appliedAt,
        updatedAt: applications.updatedAt,
        statusHistory: applications.statusHistory,
        // Job info
        jobPostingId: jobPostings.id,
        jobTitle: jobPostings.jobTitle,
        locationCity: jobPostings.locationCity,
        locationRemote: jobPostings.locationRemote,
        employmentType: jobPostings.employmentType,
        salaryMin: jobPostings.salaryMin,
        salaryMax: jobPostings.salaryMax,
        salaryCurrency: jobPostings.salaryCurrency,
        jobStatus: jobPostings.status,
        // Employer / Company info
        companyName: users.companyName,
        companyIndustry: users.companyIndustry,
      })
      .from(applications)
      .leftJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
      .leftJoin(users, eq(applications.employerId, users.id))
      .where(eq(applications.applicantId, user.userId))
      .orderBy(desc(applications.appliedAt))
      .all();

    // Build summary counts
    const stats = {
      total: userApps.length,
      received: userApps.filter((a) => a.status === 'received').length,
      under_review: userApps.filter((a) => a.status === 'under_review').length,
      shortlisted: userApps.filter((a) => a.status === 'shortlisted').length,
      accepted: userApps.filter((a) => a.status === 'accepted').length,
      rejected: userApps.filter((a) => a.status === 'rejected').length,
    };

    return new Response(JSON.stringify({ applications: userApps, stats }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error fetching applications:', error);
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
