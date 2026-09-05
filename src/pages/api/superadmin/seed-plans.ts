import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { plans } from '../../../db/schema';

export const POST: APIRoute = async ({ locals, request, redirect }) => {
  // @ts-ignore
  if (!locals.user || locals.user.userType !== 'superadmin') {
    return new Response('Unauthorized', { status: 403 });
  }

  const db = getDb();

  const defaultPlans = [
    {
      planId: 'P001',
      planName: 'Basic Plan',
      description: 'Free basic plan for individuals and small startups',
      jobPostingLimit: 30,
      resumeLimit: 500,
      candidateApplyLimit: 200,
      price: 0,
      annualPrice: 0,
      currency: 'USD',
      billingCycle: 'monthly',
      isActive: true,
    },
    {
      planId: 'P002',
      planName: 'Growth Plan',
      description: 'Advanced limits for scaling teams and active candidates',
      jobPostingLimit: 60,
      resumeLimit: 3000,
      candidateApplyLimit: 450,
      price: 0,
      annualPrice: 0,
      currency: 'USD',
      billingCycle: 'monthly',
      isActive: true,
    },
    {
      planId: 'P003',
      planName: 'Premium Plan',
      description: 'Unlimited features for large enterprises and power users',
      jobPostingLimit: 999999,
      resumeLimit: 999999,
      candidateApplyLimit: 999999,
      price: 0,
      annualPrice: 0,
      currency: 'USD',
      billingCycle: 'monthly',
      isActive: true,
    }
  ];

  try {
    // Insert plans, ignore if they already exist
    await db.insert(plans).values(defaultPlans).onConflictDoNothing();
    return redirect('/superadmin/plans');
  } catch (error) {
    console.error('Failed to seed plans:', error);
    return new Response('Failed to seed plans', { status: 500 });
  }
};
