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
    let value = trimmed.slice(index + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[trimmed.slice(0, index)] = value;
  }
  return env;
}

const env = { ...loadEnv('.env'), ...loadEnv('apps/api/.env'), ...process.env };
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL?.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
});

try {
  const rows = await pool.query(
    `SELECT COALESCE(
              NULLIF(trim(m.fullname), ''),
              NULLIF(trim(m.nickname), ''),
              NULLIF(trim(concat(coalesce(m.firstname, ''), ' ', coalesce(m.lastname, ''))), ''),
              u.emailaddress
            ) AS name
     FROM leagues l
     JOIN leaguemembers lm ON lm.leagueid = l.leagueid
     JOIN users u ON u.guid = lm.userid
     LEFT JOIN usermetadata m ON m.userid = u.guid
     WHERE lower(l.name) = lower($1) AND lm.approved = TRUE
     ORDER BY lower(name)`,
    ['Nocatee WSOP']
  );
  console.log(rows.rows.map((row) => row.name).join('\n'));
} finally {
  await pool.end();
}
