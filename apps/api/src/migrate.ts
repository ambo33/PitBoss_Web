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
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS payoutstructure STRING
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_invitecode
      ON groups (invitecode)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS tournamentchips (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tournamentid UUID NOT NULL REFERENCES tournaments(tournamentid) ON DELETE CASCADE,
        denomination INT NOT NULL,
        color STRING(30) NOT NULL,
        quantity INT DEFAULT 0,
        sortorder INT DEFAULT 0
      )
    `);
    console.log('Migration complete: tournament group fields, rake, payout structure, invite code uniqueness, and chip sets are available.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => { console.error(err); process.exit(1); });
