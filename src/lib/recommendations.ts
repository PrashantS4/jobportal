import { getDb } from "./db";
import { jobPostings, users, jobSearches } from "../db/schema";
import { eq, desc, and, or, isNull, notLike } from "drizzle-orm";
import { rankCandidateForJob } from "./candidate-ranker";

export interface RecommendedJob {
  id: string;
  jobTitle: string;
  description: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  locationCity: string | null;
  locationRemote: boolean | null;
  employmentType: string | null;
  experienceLevel: string | null;
  applicationsCount: number | null;
  publishedAt: Date | null;
  companyName: string | null;
  companyIndustry: string | null;
  matchScore: number;
  hasProfile: boolean;
}

export async function getRecommendedJobs(employeeId: string): Promise<RecommendedJob[]> {
  const db = getDb();

  // 1. Fetch Employee Profile
  const employeeRecords = await db
    .select({
      skills: users.skills,
      experienceYears: users.experienceYears,
      location: users.location,
    })
    .from(users)
    .where(eq(users.id, employeeId))
    .limit(1);

  if (!employeeRecords || employeeRecords.length === 0) {
    return [];
  }
  const employee = employeeRecords[0];
  
  // Parse skills safely
  let employeeSkills: string[] = [];
  if (employee.skills) {
    try {
      employeeSkills = typeof employee.skills === 'string' ? JSON.parse(employee.skills) : employee.skills;
    } catch(e) {}
  }
  employeeSkills = (Array.isArray(employeeSkills) ? employeeSkills : [])
    .map(s => String(s).toLowerCase().trim())
    .filter(s => s.length > 0);

  const hasSkills = employeeSkills.length > 0;
  const hasExperience = employee.experienceYears !== null && employee.experienceYears !== undefined;
  const hasLocation = Boolean(employee.location && employee.location.trim().length > 0);
  const hasProfile = hasSkills || hasExperience || hasLocation;

  // 2. Fetch Employee Search History (Last 10 searches)
  const recentSearches = await db
    .select({ searchQuery: jobSearches.searchQuery })
    .from(jobSearches)
    .where(eq(jobSearches.employeeId, employeeId))
    .orderBy(desc(jobSearches.searchedAt))
    .limit(10);
    
  const searchKeywords = recentSearches
    .map(s => s.searchQuery.toLowerCase().trim())
    .filter(s => s.length > 2); // Ignore very short searches

  // 3. Fetch all active/published jobs
  const jobs = await db
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
      companyName: users.companyName,
      companyIndustry: users.companyIndustry,
    })
    .from(jobPostings)
    .leftJoin(users, eq(jobPostings.employerId, users.id))
    .where(
      and(
        eq(jobPostings.status, 'published'),
        notLike(jobPostings.id, 'external_%'),
        or(eq(jobPostings.isDeleted, false), isNull(jobPostings.isDeleted))
      )
    )
    .all();

  // 4. Score each job
  const scoredJobs: RecommendedJob[] = jobs.map(job => {
    // If the candidate has NOT built their profile and has no search history, do NOT show a fake match %
    if (!hasProfile && searchKeywords.length === 0) {
      return {
        id: job.id,
        jobTitle: job.jobTitle,
        description: job.description,
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        locationCity: job.locationCity,
        locationRemote: job.locationRemote,
        employmentType: job.employmentType,
        experienceLevel: job.experienceLevel,
        applicationsCount: job.applicationsCount,
        publishedAt: job.publishedAt,
        companyName: job.companyName,
        companyIndustry: job.companyIndustry,
        matchScore: 0,
        hasProfile: false,
      };
    }

    // --- Unified Candidate-Ranker Logic ---
    const rankingResult = rankCandidateForJob(
      {
        id: employeeId,
        firstName: '',
        lastName: '',
        email: '',
        skills: employee.skills,
        experienceYears: employee.experienceYears,
        location: employee.location,
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

    let score = rankingResult.overallScore;

    // --- Search Intent Boost (Max 10 additional points) ---
    if (searchKeywords.length > 0) {
      let searchMatches = 0;
      const jobText = `${job.jobTitle} ${job.description}`.toLowerCase();
      
      for (const keyword of searchKeywords) {
        if (jobText.includes(keyword)) {
          searchMatches++;
        }
      }
      
      const searchScore = Math.min((searchMatches / searchKeywords.length) * 10, 10);
      score = Math.min(score + searchScore, 100);
    }

    return {
      id: job.id,
      jobTitle: job.jobTitle,
      description: job.description,
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      locationCity: job.locationCity,
      locationRemote: job.locationRemote,
      employmentType: job.employmentType,
      experienceLevel: job.experienceLevel,
      applicationsCount: job.applicationsCount,
      publishedAt: job.publishedAt,
      companyName: job.companyName,
      companyIndustry: job.companyIndustry,
      matchScore: Math.round(score),
      hasProfile: true,
    };
  });

  // Sort by match score descending if profile exists, otherwise sort by latest published date
  if (hasProfile || searchKeywords.length > 0) {
    scoredJobs.sort((a, b) => b.matchScore - a.matchScore);
  } else {
    scoredJobs.sort((a, b) => {
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dateB - dateA;
    });
  }
  
  return scoredJobs;
}
