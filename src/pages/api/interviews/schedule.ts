import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { interviews, applications, jobPostings, users, notifications } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user || user.userType !== 'employer') {
      return new Response(JSON.stringify({ error: 'Unauthorized. Employer access required.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const body = await request.json().catch(() => ({}));
    const {
      interviewId,
      applicationId,
      title,
      interviewType = 'video',
      meetingLink,
      scheduledAt, // ISO string or timestamp number
      durationMinutes = 45,
      notes = '',
      interviewerNames = '',
      timezone = 'UTC'
    } = body;

    if (!applicationId || !title || !scheduledAt) {
      return new Response(JSON.stringify({ error: 'Missing required fields: applicationId, title, and scheduledAt are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const db = getDb();

    // Verify application belongs to this employer
    const appRecord = await db.select({
      id: applications.id,
      applicantId: applications.applicantId,
      employerId: applications.employerId,
      jobPostingId: applications.jobPostingId,
      jobTitle: jobPostings.jobTitle,
      candidateFirstName: users.firstName,
      candidateLastName: users.lastName,
      candidateEmail: users.email
    })
    .from(applications)
    .innerJoin(jobPostings, eq(applications.jobPostingId, jobPostings.id))
    .innerJoin(users, eq(applications.applicantId, users.id))
    .where(and(
      eq(applications.id, applicationId),
      eq(applications.employerId, user.userId)
    ))
    .get();

    if (!appRecord) {
      return new Response(JSON.stringify({ error: 'Application not found or unauthorized.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return new Response(JSON.stringify({ error: 'Invalid scheduledAt date format.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const finalId = interviewId || crypto.randomUUID();
    const durationNum = parseInt(durationMinutes, 10) || 45;

    if (interviewId) {
      // Update existing interview
      await db.update(interviews)
        .set({
          title,
          interviewType,
          meetingLink: meetingLink || null,
          scheduledAt: scheduledDate,
          durationMinutes: durationNum,
          status: 'rescheduled',
          notes: notes || null,
          interviewerNames: interviewerNames || null,
          timezone,
          updatedAt: new Date()
        })
        .where(and(
          eq(interviews.id, interviewId),
          eq(interviews.employerId, user.userId)
        ));
    } else {
      // Insert new interview
      await db.insert(interviews).values({
        id: finalId,
        applicationId: appRecord.id,
        jobPostingId: appRecord.jobPostingId,
        employerId: user.userId,
        candidateId: appRecord.applicantId,
        title,
        interviewType,
        meetingLink: meetingLink || null,
        scheduledAt: scheduledDate,
        durationMinutes: durationNum,
        status: 'scheduled',
        notes: notes || null,
        interviewerNames: interviewerNames || null,
        timezone,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // Automatically update application status to 'shortlisted' if still in received/under_review
    await db.update(applications)
      .set({
        status: 'shortlisted',
        updatedAt: new Date()
      })
      .where(and(
        eq(applications.id, appRecord.id),
        eq(applications.employerId, user.userId)
      ));

    // Create an in-app candidate notification
    const formattedTime = scheduledDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const notifMsg = `You have an interview scheduled for "${appRecord.jobTitle}" on ${formattedTime}. Check your Interviews tab to view details and add to your calendar.`;

    try {
      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        userId: appRecord.applicantId,
        title: `📅 Interview Scheduled: ${appRecord.jobTitle}`,
        message: notifMsg,
        type: 'shortlist',
        isRead: false,
        createdAt: new Date()
      });
    } catch (notifErr) {
      console.error('Failed to create interview notification:', notifErr);
    }

    return new Response(JSON.stringify({
      success: true,
      interviewId: finalId,
      message: interviewId ? 'Interview rescheduled successfully' : 'Interview scheduled successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error scheduling interview:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
