import { pool } from './db';

function generateTvCode(existing: Set<string>): string {
  let code = '';
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (existing.has(code));
  existing.add(code);
  return code;
}

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
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS rebuychips INT DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS addonchips INT DEFAULT 0
    `);
    await client.query(`
      ALTER TABLE tournaments
      ADD COLUMN IF NOT EXISTS tvdisplaycode STRING(8)
    `);
    const existingCodeRows = await client.query<{ tvdisplaycode: string | null }>(`
      SELECT tvdisplaycode
      FROM tournaments
      WHERE tvdisplaycode IS NOT NULL
    `);
    const existingCodes = new Set(
      existingCodeRows.rows
        .map((row) => row.tvdisplaycode)
        .filter((value): value is string => Boolean(value))
    );
    const missingCodeRows = await client.query<{ tournamentid: string }>(`
      SELECT tournamentid
      FROM tournaments
      WHERE tvdisplaycode IS NULL OR length(tvdisplaycode) < 6
    `);
    for (const row of missingCodeRows.rows) {
      await client.query(
        `UPDATE tournaments
         SET tvdisplaycode = $2
         WHERE tournamentid = $1`,
        [row.tournamentid, generateTvCode(existingCodes)]
      );
    }
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_invitecode
      ON groups (invitecode)
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_tournament_tvdisplaycode
      ON tournaments (tvdisplaycode)
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
    await client.query(`
      ALTER TABLE tournamentplayers
      ADD COLUMN IF NOT EXISTS knockedoutbyuserid UUID
    `);
    await client.query(`
      ALTER TABLE tournamentplayers
      ADD COLUMN IF NOT EXISTS knockedoutat TIMESTAMPTZ
    `);
    console.log('Migration complete: tournament group fields, rake, payout structure, rebuy/add-on chip fields, invite code uniqueness, TV display codes, chip sets, and knockout tracking are available.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => { console.error(err); process.exit(1); });
