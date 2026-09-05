import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { users, jobPostings, applications, posts } from '../../../../db/schema';
import { evaluateEmployer, evaluateCandidate, type FraudEvaluation } from '../../../../lib/fraud-detector';

export const GET: APIRoute = async ({ locals }) => {
  // @ts-ignore
  const user = locals.user;

  if (!user || (user.userType !== 'superadmin' && user.userType !== 'admin' && user.userType !== 'masteradmin')) {
    return new Response(JSON.stringify({ error: 'Unauthorized: Admin or Superadmin access required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const db = getDb();

    // Fetch all relevant platform data
    const allUsers = await db.select().from(users).all();
    const allJobs = await db.select().from(jobPostings).all();
    const allApps = await db.select().from(applications).all();
    let allPosts: any[] = [];
    try {
      allPosts = await db.select().from(posts).all();
    } catch (e) {
      allPosts = [];
    }

    // Group jobs, apps, and posts by user/author
    const jobsByEmployer: Record<string, any[]> = {};
    for (const job of allJobs) {
      if (!jobsByEmployer[job.employerId]) jobsByEmployer[job.employerId] = [];
      jobsByEmployer[job.employerId].push(job);
    }

    const appsByCandidate: Record<string, any[]> = {};
    for (const app of allApps) {
      if (!appsByCandidate[app.applicantId]) appsByCandidate[app.applicantId] = [];
      appsByCandidate[app.applicantId].push(app);
    }

    const postsByAuthor: Record<string, any[]> = {};
    for (const post of allPosts) {
      if (!postsByAuthor[post.authorId]) postsByAuthor[post.authorId] = [];
      postsByAuthor[post.authorId].push(post);
    }

    const evaluations: FraudEvaluation[] = [];

    for (const u of allUsers) {
      // Exclude masteradmin / superadmins / admins from fraud alerts
      if (u.userType === 'superadmin' || u.userType === 'admin' || u.userType === 'masteradmin') continue;

      if (u.userType === 'employer') {
        const uJobs = jobsByEmployer[u.id] || [];
        const uPosts = postsByAuthor[u.id] || [];
        const evaluation = evaluateEmployer(u, uJobs, uPosts);
        evaluations.push(evaluation);
      } else if (u.userType === 'employee') {
        const uApps = appsByCandidate[u.id] || [];
        const uPosts = postsByAuthor[u.id] || [];
        const evaluation = evaluateCandidate(u, uApps, uPosts);
        evaluations.push(evaluation);
      }
    }

    // Sort by riskScore descending
    evaluations.sort((a, b) => b.riskScore - a.riskScore);

    const totalScanned = evaluations.length;
    const highRiskCount = evaluations.filter(e => e.riskLevel === 'HIGH').length;
    const mediumRiskCount = evaluations.filter(e => e.riskLevel === 'MEDIUM').length;
    const cleanCount = evaluations.filter(e => e.riskLevel === 'LOW').length;
    const suspendedCount = evaluations.filter(e => !e.isActive).length;
    const safetyPercentage = totalScanned > 0 ? (((cleanCount + mediumRiskCount) / totalScanned) * 100).toFixed(1) : '100.0';

    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      stats: {
        totalScanned,
        highRiskCount,
        mediumRiskCount,
        cleanCount,
        suspendedCount,
        safetyPercentage
      },
      evaluations
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Failed to complete security scan' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
