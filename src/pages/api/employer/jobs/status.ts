import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { jobPostings } from '../../../../db/schema';
import { eq, and } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  // @ts-ignore
  const user = locals.user;

  if (!user || user.userType !== 'employer') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const data = await request.json();
    const { jobId, status } = data;

    if (!jobId || !['published', 'draft', 'closed'].includes(status)) {
      return new Response(JSON.stringify({ error: 'Invalid jobId or status' }), { status: 400 });
    }

    const db = getDb();

    // Verify job belongs to employer
    const job = await db.select().from(jobPostings).where(eq(jobPostings.id, jobId)).get();
    if (!job || job.employerId !== user.userId) {
      return new Response(JSON.stringify({ error: 'Job not found or forbidden' }), { status: 403 });
    }

    const prevStatus = job.status;

    await db.update(jobPostings)
      .set({ 
        status,
        ...(status === 'published' && !job.publishedAt ? { publishedAt: new Date() } : {})
      })
      .where(eq(jobPostings.id, jobId));

    if (status === 'published' && prevStatus !== 'published') {
      try {
        const { users, notifications } = await import('../../../../db/schema');
        const employerRecord = await db.select().from(users).where(eq(users.id, user.userId)).get();
        const allEmployees = await db.select({
          id: users.id,
          skills: users.skills,
        }).from(users).where(eq(users.userType, 'employee')).all();

        const jobTextToMatch = `${job.jobTitle} ${job.description} ${job.requirements || ''}`.toLowerCase();
        const companyName = employerRecord?.companyName || `${employerRecord?.firstName} ${employerRecord?.lastName}` || 'A verified company';
        const notificationsToInsert = [];

        for (const employee of allEmployees) {
          if (!employee.skills) continue;
          let skillsArray: string[] = [];
          try {
            skillsArray = typeof employee.skills === 'string' ? JSON.parse(employee.skills) : employee.skills;
          } catch (e) { continue; }

          if (!Array.isArray(skillsArray) || skillsArray.length === 0) continue;

          const validSkills = skillsArray.filter(s => typeof s === 'string' && s.trim().length > 1);
          if (validSkills.length === 0) continue;

          const matchedSkills = validSkills.filter(skill => {
            const s = skill.trim().toLowerCase();
            return jobTextToMatch.includes(s);
          });

          const matchPercentage = Math.round((matchedSkills.length / validSkills.length) * 100);

          if (matchPercentage >= 80) {
            notificationsToInsert.push({
              id: crypto.randomUUID(),
              userId: employee.id,
              title: `🎯 ${matchPercentage}% Skill Match: ${job.jobTitle}`,
              message: `Your profile has an ${matchPercentage}% match for the new "${job.jobTitle}" position at ${companyName}. Review the role and apply now!`,
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
        console.error('Failed to create matching notifications in status.ts:', matchErr);
      }
    }

    return new Response(JSON.stringify({ message: 'Status updated successfully' }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { status: 500 });
  }
};
