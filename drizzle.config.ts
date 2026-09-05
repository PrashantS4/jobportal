import { defineConfig } from 'drizzle-kit';
import fs from 'fs';
import path from 'path';

// Automatically find the local D1 emulator database file
let localDbPath = '';
const d1Dir = path.resolve('.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
if (fs.existsSync(d1Dir)) {
  const files = fs.readdirSync(d1Dir);
  const sqliteFile = files.find(f => f.endsWith('.sqlite') && !f.startsWith('metadata'));
  if (sqliteFile) {
    localDbPath = path.join(d1Dir, sqliteFile);
  }
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  ...(localDbPath ? { dbCredentials: { url: localDbPath } } : {})
});
