import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { jobPostings, users, recommendations } from '../../../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { env } from 'cloudflare:workers';
import { rankCandidateForJob, type CandidateProfile, type JobCriteria } from '../../../lib/candidate-ranker';

export const GET: APIRoute = async ({ request }) => {
  try {
    // 1. Verify CRON_SECRET if it's set in the environment
    // @ts-ignore
    const cronSecret = env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get('Authorization');
      if (authHeader !== `Bearer ${cronSecret}`) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    const db = getDb();
    const now = new Date();
    // Look back 7 days for new jobs
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgoUnix = Math.floor(sevenDaysAgo.getTime() / 1000);

    // 2. Query active, published jobs from the last 7 days
    const recentJobs = await db.select()
      .from(jobPostings)
      .where(and(
        eq(jobPostings.status, 'published'),
        eq(jobPostings.isDeleted, false),
        sql`${jobPostings.publishedAt} >= ${sevenDaysAgoUnix}`
      ))
      .all();

    if (recentJobs.length === 0) {
      return new Response(JSON.stringify({ message: 'No recent jobs found to match.' }), { status: 200 });
    }

    // 3. Query active candidates (employees)
    const activeCandidates = await db.select()
      .from(users)
      .where(and(
        eq(users.userType, 'employee'),
        eq(users.isActive, true)
      ))
      .all();

    let newRecommendationsCount = 0;

    // 4. Iterate and compute matches
    for (const job of recentJobs) {
      const jobCriteria: JobCriteria = {
        id: job.id,
        jobTitle: job.jobTitle,
        description: job.description,
        requirements: job.requirements,
        experienceLevel: job.experienceLevel,
        locationCity: job.locationCity,
        locationRemote: job.locationRemote,
        employmentType: job.employmentType,
      };

      for (const candidate of activeCandidates) {
        // Skip if recommendation already exists
        const existingRec = await db.select()
          .from(recommendations)
          .where(and(
            eq(recommendations.employeeId, candidate.id),
            eq(recommendations.jobPostingId, job.id)
          ))
          .get();

        if (existingRec) continue;

        const candidateProfile: CandidateProfile = {
          id: candidate.id,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          email: candidate.email,
          phone: candidate.phone,
          skills: candidate.skills,
          experienceYears: candidate.experienceYears,
          location: candidate.location,
          bio: candidate.bio,
          verifiedStatus: candidate.verifiedStatus,
        };

        // Rank the candidate
        // @ts-ignore
        const rankingResult = await rankCandidateForJob(candidateProfile, jobCriteria, env.GEMINI_API_KEY);

        // 5. Insert if score is high enough (e.g., > 65)
        if (rankingResult.overallScore >= 65) {
          await db.insert(recommendations).values({
            id: crypto.randomUUID(),
            employeeId: candidate.id,
            jobPostingId: job.id,
            matchScore: rankingResult.overallScore,
            skillMatch: rankingResult.skillScore,
            experienceMatch: rankingResult.experienceScore,
            preferenceMatch: rankingResult.domainScore, // mapping domain score to preference match
            locationMatch: rankingResult.locationScore,
          });
          newRecommendationsCount++;
        }
      }
    }

    return new Response(JSON.stringify({ 
      message: 'Match process completed.', 
      jobsProcessed: recentJobs.length,
      candidatesProcessed: activeCandidates.length,
      newRecommendationsGenerated: newRecommendationsCount
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Cron match error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { status: 500 });
  }
};
