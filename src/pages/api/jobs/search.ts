import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { eq, and, sql, desc, like, or, isNull, notLike } from 'drizzle-orm';
import { jobPostings, users, jobSearches } from '../../../db/schema';
import { rankCandidateForJob } from '../../../lib/candidate-ranker';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q') || '';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const typeFilter = url.searchParams.get('type') || '';
    const expFilter = url.searchParams.get('exp') || '';
    const remoteFilter = url.searchParams.get('remote') === 'true';

    const db = getDb();
    let jobs: any[] = [];

    // @ts-ignore
    const userPayload = locals.user;

    let employeeProfile: any = null;
    let searchKeywords: string[] = [];

    if (userPayload && userPayload.userType === 'employee') {
      try {
        const empRecords = await db
          .select({ skills: users.skills, experienceYears: users.experienceYears, location: users.location })
          .from(users)
          .where(eq(users.id, userPayload.userId))
          .limit(1)
          .all();
        
        if (empRecords && empRecords.length > 0) employeeProfile = empRecords[0];

        const recentSearches = await db
          .select({ searchQuery: jobSearches.searchQuery })
          .from(jobSearches)
          .where(eq(jobSearches.employeeId, userPayload.userId))
          .orderBy(desc(jobSearches.searchedAt))
          .limit(10)
          .all();
          
        searchKeywords = (recentSearches || [])
          .map(s => (s.searchQuery || '').toLowerCase().trim())
          .filter(s => s.length > 2);
      } catch (profileErr) {
        console.error("Error loading candidate profile for search:", profileErr);
      }
    }

    let conditions = [
      eq(jobPostings.status, 'published'),
      notLike(jobPostings.id, 'external_%'),
      or(eq(jobPostings.isDeleted, false), isNull(jobPostings.isDeleted))
    ];

    if (typeFilter) conditions.push(eq(jobPostings.employmentType, typeFilter));
    if (expFilter) conditions.push(eq(jobPostings.experienceLevel, expFilter));
    if (remoteFilter) conditions.push(eq(jobPostings.locationRemote, true));

    if (query) {
      const qLower = `%${query.toLowerCase()}%`;
      conditions.push(
        or(
          like(sql`LOWER(${jobPostings.jobTitle})`, qLower),
          like(sql`LOWER(${jobPostings.description})`, qLower),
          like(sql`LOWER(${users.companyName})`, qLower),
          like(sql`LOWER(${jobPostings.locationCity})`, qLower)
        )!
      );
    }

    const baseQuery = db
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
        publishedAt: jobPostings.publishedAt,
        companyName: users.companyName,
        companyIndustry: users.companyIndustry,
      })
      .from(jobPostings)
      .leftJoin(users, eq(jobPostings.employerId, users.id))
      .where(and(...conditions))
      .orderBy(desc(jobPostings.publishedAt));

    if (employeeProfile) {
      // Fetch matching jobs for in-memory scoring
      const allJobs = await baseQuery.all();

      let employeeSkills: string[] = [];
      if (employeeProfile.skills) {
        try {
          employeeSkills = typeof employeeProfile.skills === 'string' ? JSON.parse(employeeProfile.skills) : employeeProfile.skills;
        } catch (e) {}
      }
      employeeSkills = (Array.isArray(employeeSkills) ? employeeSkills : [])
        .map(s => String(s).toLowerCase().trim())
        .filter(s => s.length > 0);

      const hasProfile = employeeSkills.length > 0 || 
                        (employeeProfile.experienceYears !== null && employeeProfile.experienceYears !== undefined) || 
                        Boolean(employeeProfile.location && employeeProfile.location.trim().length > 0);

      jobs = (allJobs || []).map(job => {
        try {
          const rankingResult = rankCandidateForJob(
            {
              id: userPayload.userId,
              firstName: '', lastName: '', email: '',
              skills: employeeProfile.skills,
              experienceYears: employeeProfile.experienceYears,
              location: employeeProfile.location,
            },
            {
              id: job.id,
              jobTitle: job.jobTitle || '',
              description: job.description || '',
              requirements: job.requirements,
              experienceLevel: job.experienceLevel,
              locationCity: job.locationCity,
              locationRemote: job.locationRemote,
              employmentType: job.employmentType,
            }
          );

          let score = rankingResult.overallScore;

          if (searchKeywords.length > 0) {
            let searchMatches = 0;
            const jobText = `${job.jobTitle} ${job.description}`.toLowerCase();
            for (const keyword of searchKeywords) {
              if (jobText.includes(keyword)) searchMatches++;
            }
            score = Math.min(score + Math.min((searchMatches / searchKeywords.length) * 10, 10), 100);
          }

          return {
            ...job,
            companyName: job.companyName || 'Verified Employer',
            matchScore: Math.round(score),
            hasProfile: true
          };
        } catch (rankErr) {
          return {
            ...job,
            companyName: job.companyName || 'Verified Employer',
            matchScore: 0,
            hasProfile: false
          };
        }
      });

      // Sort by matchScore descending if profile exists
      if (hasProfile || searchKeywords.length > 0) {
        jobs.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
      }

      // Apply pagination in-memory
      jobs = jobs.slice(offset, offset + limit);
    } else {
      // Standard database pagination for guests/employers
      const resultJobs = await baseQuery.limit(limit).offset(offset).all();
      jobs = (resultJobs || []).map(j => ({
        ...j,
        companyName: j.companyName || 'Verified Employer'
      }));
    }

    return new Response(JSON.stringify({ jobs, page, hasMore: jobs.length === limit }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error("Search API Error:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch jobs", details: error?.message }), { status: 500 });
  }
};
