import type { PoolClient } from 'pg';

export type JoinCodeEntityType = 'group' | 'league';

export const JOIN_CODE_MAX_LENGTH = 10;

const RANDOM_CODE_LENGTH = 6;
const CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VALID_JOIN_CODE = /^[A-Z0-9 ]{1,10}$/;

export function normalizeJoinCode(value: string | undefined | null): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/^ +| +$/g, '')
    .replace(/ {2,}/g, ' ')
    .slice(0, JOIN_CODE_MAX_LENGTH);
}

export function isValidJoinCode(value: string): boolean {
  return VALID_JOIN_CODE.test(value);
}

export function generateJoinCode(length = RANDOM_CODE_LENGTH): string {
  return Array.from(
    { length },
    () => CODE_CHARACTERS[Math.floor(Math.random() * CODE_CHARACTERS.length)]
  ).join('');
}

export class JoinCodeConflictError extends Error {
  constructor() {
    super('That join code is already in use.');
  }
}

export async function syncJoinCode(
  client: PoolClient,
  entityType: JoinCodeEntityType,
  entityId: string,
  code: string,
): Promise<void> {
  const existingCode = await client.query<{ entitytype: JoinCodeEntityType; entityid: string }>(
    `SELECT entitytype, entityid
     FROM joincodes
     WHERE code = $1`,
    [code]
  );
  const owner = existingCode.rows[0];
  if (owner && (owner.entitytype !== entityType || owner.entityid !== entityId)) {
    throw new JoinCodeConflictError();
  }

  const current = await client.query<{ code: string }>(
    `SELECT code
     FROM joincodes
     WHERE entitytype = $1 AND entityid = $2`,
    [entityType, entityId]
  );
  if (current.rows[0]) {
    await client.query(
      `UPDATE joincodes
       SET code = $1, updatedat = now()
       WHERE entitytype = $2 AND entityid = $3`,
      [code, entityType, entityId]
    );
    return;
  }

  await client.query(
    `INSERT INTO joincodes (code, entitytype, entityid)
     VALUES ($1, $2, $3)`,
    [code, entityType, entityId]
  );
}
