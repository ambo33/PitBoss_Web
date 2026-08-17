import fs from 'node:fs';
import pg from 'pg';

function loadEnv(path) {
  const env = {};
  if (!fs.existsSync(path)) return env;
  for (const line of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    let value = trimmed.slice(index + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = { ...loadEnv('.env'), ...loadEnv('apps/api/.env'), ...process.env };
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL?.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
});

try {
  const result = await pool.query(
    `UPDATE leagueauditlogs
     SET details = jsonb_set(details, '{source}', to_jsonb('season spreadsheet import'::TEXT), TRUE)
     WHERE action = 'spreadsheet_results_imported'
       AND details ? 'source'
     RETURNING auditid`
  );
  console.log(JSON.stringify({ updatedAuditRows: result.rowCount }, null, 2));
} finally {
  await pool.end();
}
