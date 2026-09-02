import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
});

try {
  await client.connect();
  const requests = await client.query(
    `SELECT status, COALESCE(failuremessage, '') AS failuremessage, count(*)::int AS count
     FROM tournamentmusicrequests
     GROUP BY status, failuremessage
     ORDER BY status, failuremessage`
  );
  const connections = await client.query(
    `SELECT count(*)::int AS count,
            count(*) FILTER (WHERE lower(COALESCE(product, '')) = 'premium')::int AS premiumcount,
            count(*) FILTER (WHERE scope LIKE '%user-modify-playback-state%')::int AS playbackscopecount
     FROM spotifyconnections`
  );
  console.log(JSON.stringify({ requests: requests.rows, connections: connections.rows[0] }));
} finally {
  await client.end().catch(() => undefined);
}
