import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { jobPostings, users, plans, notifications } from '../../../db/schema';
import { eq, and, sql } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  // @ts-ignore
  const user = locals.user;

  if (!user || user.userType !== 'employer') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const data = await request.json();
    const {
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

    if (!jobTitle || !description) {
      return new Response(JSON.stringify({ error: 'Job title and description are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = getDb();

    // Fetch the employer's plan to enforce limits
    let maxResumesAllowed = 500; // Default for basic
    let jobPostingLimit = 30; // Default for basic
    const employerRecord = await db.select().from(users).where(eq(users.id, user.userId)).get();
    if (employerRecord && employerRecord.isActive === false) {
      return new Response(JSON.stringify({ error: 'Your employer account has been suspended by an administrator. Job posting is disabled.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (employerRecord && employerRecord.planId) {
      const planRecord = await db.select().from(plans).where(eq(plans.planId, employerRecord.planId)).get();
      if (planRecord) {
        maxResumesAllowed = planRecord.resumeLimit;
        jobPostingLimit = planRecord.jobPostingLimit;
      }
    }

    // Count published/active jobs
    const activeJobsCountRecord = await db.select({ count: sql<number>`count(*)` })
      .from(jobPostings)
      .where(and(
        eq(jobPostings.employerId, user.userId),
        eq(jobPostings.status, 'published')
      ))
      .get();
    const activeJobsCount = activeJobsCountRecord?.count || 0;

    if (activeJobsCount >= jobPostingLimit) {
      return new Response(JSON.stringify({ error: `Active job posting limit reached (${jobPostingLimit} active jobs allowed). Please upgrade your plan.` }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const jobId = crypto.randomUUID();

    await db.insert(jobPostings).values({
      id: jobId,
      employerId: user.userId,
      jobTitle,
      description,
      employmentType: employmentType || null,
      experienceLevel: experienceLevel || null,
      locationCity: locationCity || null,
      locationRemote: locationRemote === true,
      salaryMin: salaryMin && !isNaN(parseFloat(salaryMin)) ? parseFloat(salaryMin) : null,
      salaryMax: salaryMax && !isNaN(parseFloat(salaryMax)) ? parseFloat(salaryMax) : null,
      salaryCurrency: salaryCurrency || 'USD',
      applicationFormConfig: applicationFormConfig 
        ? (typeof applicationFormConfig === 'string' ? applicationFormConfig : JSON.stringify(applicationFormConfig)) 
        : null,
      status: 'published',
      publishedAt: new Date(),
      maxResumesAllowed
    });

    // --- Admin & MasterAdmin Notifications ---
    try {
      const systemAdmins = await db.select({ id: users.id })
                                   .from(users)
                                   .where(sql`${users.userType} IN ('admin', 'superadmin', 'masteradmin')`).all();
      
      if (systemAdmins.length > 0) {
        const companyName = employerRecord?.companyName || `${employerRecord?.firstName} ${employerRecord?.lastName}` || 'An employer';
        const adminNotifs = systemAdmins.map(admin => ({
          id: crypto.randomUUID(),
          userId: admin.id,
          title: 'New Job Posted',
          message: `A new job "${jobTitle}" has been posted by ${companyName}.`,
          type: 'system',
          isRead: false,
          createdAt: new Date(),
        }));
        await db.insert(notifications).values(adminNotifs);
      }
    } catch (adminNotifErr) {
      console.error('Failed to create admin notifications', adminNotifErr);
    }

    // --- 80%+ Skill Matching Candidate Notifications ---
    try {
      const allEmployees = await db.select({
        id: users.id,
        skills: users.skills,
        headline: users.headline,
        bio: users.bio,
      }).from(users).where(eq(users.userType, 'employee')).all();

      const jobTextToMatch = `${jobTitle} ${description} ${data.requirements || ''}`.toLowerCase();
      const companyName = employerRecord?.companyName || `${employerRecord?.firstName} ${employerRecord?.lastName}` || 'A verified company';
      const notificationsToInsert = [];

      for (const employee of allEmployees) {
        if (!employee.skills) continue;
        let skillsArray: string[] = [];
        try {
          skillsArray = typeof employee.skills === 'string' ? JSON.parse(employee.skills) : employee.skills;
        } catch (e) { continue; }

        if (!Array.isArray(skillsArray) || skillsArray.length === 0) continue;

        // Clean & normalize candidate skills
        const validSkills = skillsArray.filter(s => typeof s === 'string' && s.trim().length > 1);
        if (validSkills.length === 0) continue;

        // Count how many of candidate's skills appear in job description/requirements/title
        const matchedSkills = validSkills.filter(skill => {
          const s = skill.trim().toLowerCase();
          return jobTextToMatch.includes(s);
        });

        // Compute match percentage
        const matchPercentage = Math.round((matchedSkills.length / validSkills.length) * 100);

        // Notify if matched candidate's skills more than 80% (or high overlap)
        if (matchPercentage >= 80) {
          notificationsToInsert.push({
            id: crypto.randomUUID(),
            userId: employee.id,
            title: `🎯 ${matchPercentage}% Skill Match: ${jobTitle}`,
            message: `Your profile has an ${matchPercentage}% match for the new "${jobTitle}" position at ${companyName}. Review the role and apply now!`,
            type: 'job_match',
            isRead: false,
            createdAt: new Date(),
          });
        }
      }

      if (notificationsToInsert.length > 0) {
        for (const notif of notificationsToInsert) {
          await db.insert(notifications).values(notif);
        }
      }
    } catch (matchErr) {
      console.error('Failed to create 80%+ matching notifications', matchErr);
    }


    return new Response(JSON.stringify({ message: 'Job posted successfully', jobId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error posting job:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
