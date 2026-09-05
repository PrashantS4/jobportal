import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { plans } from '../../../db/schema';
import { eq } from 'drizzle-orm';

export const POST: APIRoute = async ({ locals, request, redirect }) => {
  // @ts-ignore
  if (!locals.user || (locals.user.userType !== 'superadmin' && locals.user.userType !== 'masteradmin')) {
    return new Response('Unauthorized', { status: 403 });
  }

  const db = getDb();
  const formData = await request.formData();

  const planId = formData.get('planId')?.toString();
  const planName = formData.get('planName')?.toString();
  const price = formData.get('price');
  const annualPrice = formData.get('annualPrice');
  const currency = formData.get('currency')?.toString();
  const jobPostingLimit = formData.get('jobPostingLimit');
  const resumeLimit = formData.get('resumeLimit');

  const featureList = [
    'emp_jobs', 'emp_applications', 'emp_interviews', 'emp_saved', 'emp_recommended', 'emp_messaging',
    'er_screening', 'er_jobs', 'er_applications', 'er_interviews', 'er_candidates', 'er_analytics', 'er_messaging'
  ];

  const featuresObj: Record<string, boolean> = {};
  for (const feature of featureList) {
    featuresObj[feature] = formData.get(`feature_${feature}`) === 'true';
  }
  const features = JSON.stringify(featuresObj);

  if (!planId || !planName || !price || !annualPrice || !currency || !jobPostingLimit || !resumeLimit) {
    return new Response('Missing required fields', { status: 400 });
  }

  try {
    await db.update(plans)
      .set({
        planName,
        price: parseFloat(price.toString()),
        annualPrice: parseFloat(annualPrice.toString()),
        currency,
        jobPostingLimit: parseInt(jobPostingLimit.toString()),
        resumeLimit: parseInt(resumeLimit.toString()),
        features,
      })
      .where(eq(plans.planId, planId));

    // @ts-ignore
    const callerType = locals.user.userType;
    return redirect(callerType === 'masteradmin' ? '/masteradmin/plans' : '/superadmin/plans');
  } catch (error) {
    console.error('Failed to update plan:', error);
    return new Response('Failed to update plan', { status: 500 });
  }
};
