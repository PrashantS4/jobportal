import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { env } from 'cloudflare:workers';

/**
 * Initialize Drizzle ORM with the Cloudflare D1 binding.
 * In Astro v7+, cloudflare:workers is the correct way to access bindings.
 */
export function getDb() {
  if (!env?.DB) {
    throw new Error('D1 Database binding (env.DB) is missing. Check your wrangler.jsonc bindings.');
  }
  return drizzle(env.DB, { schema });
}
