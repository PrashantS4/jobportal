import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { applications, jobPostings, users } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { rankCandidateForJob, type CandidateProfile, type JobCriteria } from '../../../lib/candidate-ranker';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // @ts-ignore
    const user = locals.user;
    if (!user || user.userType !== 'employer') {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 });
    }

    const { applicationId } = await request.json();
    if (!applicationId) return new Response(JSON.stringify({ error: 'Application ID required' }), { status: 400 });

    const db = getDb();
    const app = await db.select().from(applications).where(eq(applications.id, applicationId)).get();
    if (!app || app.employerId !== user.userId) {
      return new Response(JSON.stringify({ error: 'Application not found' }), { status: 404 });
    }

    const job = await db.select().from(jobPostings).where(eq(jobPostings.id, app.jobPostingId)).get();
    if (!job) return new Response(JSON.stringify({ error: 'Job not found' }), { status: 404 });

    // --- AI Match Evaluation via candidate-ranker ---
    let aiScore = null;
    let aiSummary = null;

    try {
      const candidateUser = await db.select().from(users).where(eq(users.id, app.applicantId)).get();
      if (candidateUser) {
        const rankingResult = rankCandidateForJob(
          {
            id: candidateUser.id,
            firstName: candidateUser.firstName,
            lastName: candidateUser.lastName,
            email: candidateUser.email,
            phone: candidateUser.phone,
            skills: candidateUser.skills,
            experienceYears: candidateUser.experienceYears,
            location: candidateUser.location,
            bio: candidateUser.bio,
            verifiedStatus: candidateUser.verifiedStatus,
            resumeUrl: app.resumeUrl,
          },
          {
            id: job.id,
            jobTitle: job.jobTitle,
            description: job.description,
            requirements: job.requirements,
            experienceLevel: job.experienceLevel,
            locationCity: job.locationCity,
            locationRemote: job.locationRemote,
            employmentType: job.employmentType,
          }
        );

        aiScore = rankingResult.overallScore;
        aiSummary = rankingResult.aiSummary;
      }
    } catch (evalErr: any) {
      console.error('Candidate ranker evaluation failed:', evalErr);
      return new Response(JSON.stringify({ error: `Evaluation failed: ${evalErr.message || evalErr}` }), { status: 500 });
    }

    await db.update(applications)
      .set({ aiScore, aiSummary })
      .where(eq(applications.id, applicationId));

    return new Response(JSON.stringify({ success: true, score: aiScore, summary: aiSummary }), { status: 200 });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};
