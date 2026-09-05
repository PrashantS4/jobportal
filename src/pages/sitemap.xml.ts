import type { APIRoute } from 'astro';
import { getDb } from '../lib/db';
import { jobPostings } from '../db/schema';
import { eq } from 'drizzle-orm';
import { getBaseUrl } from '../lib/config';

export const GET: APIRoute = async (context) => {
  // @ts-ignore
  const runtimeEnv = context.locals?.runtime?.env;
  let baseUrl = getBaseUrl(runtimeEnv);
  if (baseUrl.includes('localhost')) {
    baseUrl = 'https://recruitnest.prashantsinghstd.workers.dev';
  }
  const db = getDb();

  let jobsList: any[] = [];
  try {
    jobsList = await db
      .select({ id: jobPostings.id, createdAt: jobPostings.createdAt })
      .from(jobPostings)
      .where(eq(jobPostings.status, 'published'))
      .all();
  } catch (e) {
    console.error('Error fetching jobs for sitemap:', e);
  }

  const staticPages = [
    { url: '/', priority: '1.0', changefreq: 'daily' },
    { url: '/jobs', priority: '0.9', changefreq: 'hourly' },
    { url: '/pricing', priority: '0.8', changefreq: 'weekly' },
    { url: '/about', priority: '0.7', changefreq: 'monthly' },
    { url: '/privacy', priority: '0.6', changefreq: 'monthly' },
    { url: '/login', priority: '0.5', changefreq: 'monthly' },
    { url: '/register', priority: '0.5', changefreq: 'monthly' }
  ];

  const now = new Date().toISOString().split('T')[0];

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages
  .map(
    (page) => `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join('\n')}
${jobsList
  .map(
    (job) => `  <url>
    <loc>${baseUrl}/jobs/${job.id}</loc>
    <lastmod>${job.createdAt ? new Date(job.createdAt).toISOString().split('T')[0] : now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(sitemapXml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600'
    }
  });
};
