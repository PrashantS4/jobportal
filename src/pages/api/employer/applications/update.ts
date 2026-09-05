import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { applications, notifications, jobPostings, users } from '../../../../db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ request, locals }) => {
  // @ts-ignore
  const user = locals.user;

  if (!user || user.userType !== 'employer') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const data = await request.json();
    const { applicationId, status, rating, notes } = data;

    if (!applicationId) {
      return new Response(JSON.stringify({ error: 'Application ID is required' }), { status: 400 });
    }

    const db = getDb();

    // Verify application belongs to this employer
    const app = await db.select().from(applications).where(eq(applications.id, applicationId)).get();
    if (!app || app.employerId !== user.userId) {
      return new Response(JSON.stringify({ error: 'Application not found or forbidden' }), { status: 403 });
    }

    const previousStatus = app.status;

    // Prepare update object
    const updateObj: Record<string, any> = {};
    if (status) updateObj.status = status;
    if (rating !== undefined) updateObj.rating = rating ? parseInt(rating) : null;
    if (notes !== undefined) updateObj.notes = notes || null;
    updateObj.updatedAt = new Date();

    await db.update(applications)
      .set(updateObj)
      .where(eq(applications.id, applicationId));

    // Send notification to candidate if shortlisted or accepted
    if (status && status !== previousStatus) {
      try {
        const job = await db.select().from(jobPostings).where(eq(jobPostings.id, app.jobPostingId)).get();
        const employer = await db.select().from(users).where(eq(users.id, user.userId)).get();
        const companyName = employer?.companyName || `${employer?.firstName} ${employer?.lastName}` || 'An employer';
        const jobTitle = job?.jobTitle || 'the position';

        if (status === 'shortlisted') {
          await db.insert(notifications).values({
            id: crypto.randomUUID(),
            userId: app.applicantId,
            title: `You've been shortlisted! 🎉`,
            message: `Great news! ${companyName} has shortlisted your application for "${jobTitle}". Stay tuned for next interview steps or direct messages.`,
            type: 'shortlist',
            isRead: false,
            createdAt: new Date(),
          });
        } else if (status === 'accepted') {
          await db.insert(notifications).values({
            id: crypto.randomUUID(),
            userId: app.applicantId,
            title: `Application Accepted! 🌟`,
            message: `Congratulations! ${companyName} has accepted your application for "${jobTitle}".`,
            type: 'shortlist',
            isRead: false,
            createdAt: new Date(),
          });
        }
      } catch (notifErr) {
        console.error('Failed to insert candidate shortlist notification:', notifErr);
      }
    }

    return new Response(JSON.stringify({ message: 'Application updated successfully' }), { status: 200 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Server error' }), { status: 500 });
  }
};
