import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';

const DB_PATH = String.raw`.wrangler\state\v3\d1\miniflare-D1DatabaseObject\5a89c3145228d9a2bb1b447c43b6a021fdd3330c59e5fa7366450ef9db069e33.sqlite`;

const db = new DatabaseSync(DB_PATH);

// Get all user tables (skip sqlite internals and wrangler tracking tables)
const tables = db.prepare(
  `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_migrations' AND name NOT LIKE '_cf_%' ORDER BY name`
).all();

console.log('Tables found:', tables.map(t => t.name));

const sqlLines = [];

for (const { name } of tables) {
  const rows = db.prepare(`SELECT * FROM "${name}"`).all();
  if (rows.length === 0) {
    console.log(`  [SKIP] ${name} — no rows`);
    continue;
  }
  console.log(`  [EXPORT] ${name} — ${rows.length} rows`);

  for (const row of rows) {
    const cols = Object.keys(row).map(c => `"${c}"`).join(', ');
    const vals = Object.values(row).map(v => {
      if (v === null) return 'NULL';
      if (typeof v === 'number') return v;
      if (typeof v === 'bigint') return v.toString();
      return `'${String(v).replace(/'/g, "''")}'`;
    }).join(', ');
    sqlLines.push(`INSERT OR IGNORE INTO "${name}" (${cols}) VALUES (${vals});`);
  }
}

const output = sqlLines.join('\n');
writeFileSync('local_data_export.sql', output, 'utf8');
console.log(`\nExported ${sqlLines.length} INSERT statements → local_data_export.sql`);
