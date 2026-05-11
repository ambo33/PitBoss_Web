import { pool } from './db';

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS groupid UUID REFERENCES groups(groupid) ON DELETE SET NULL
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS rake DECIMAL(10,2) DEFAULT 0
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_invitecode
      ON groups (invitecode)
    `);
    console.log('Migration complete: tournaments.groupid, tournaments.rake, and groups.invitecode uniqueness are available.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => { console.error(err); process.exit(1); });
