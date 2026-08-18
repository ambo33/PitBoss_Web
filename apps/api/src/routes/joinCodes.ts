import { Router, Request, Response } from 'express';
import { queryOne } from '../db';
import { isValidJoinCode, normalizeJoinCode, type JoinCodeEntityType } from '../joinCodes';

export const joinCodesRouter = Router();

joinCodesRouter.get('/:code', async (req: Request, res: Response) => {
  const code = normalizeJoinCode(req.params.code);
  if (!isValidJoinCode(code)) {
    res.status(404).json({ error: 'Join code not found.' });
    return;
  }

  const record = await queryOne<{
    entitytype: JoinCodeEntityType;
    entityid: string;
    name: string;
  }>(
    `SELECT jc.entitytype,
            jc.entityid,
            CASE
              WHEN jc.entitytype = 'group' THEN g.name
              WHEN jc.entitytype = 'league' THEN l.name
            END AS name
     FROM joincodes jc
     LEFT JOIN groups g ON jc.entitytype = 'group' AND g.groupid = jc.entityid AND g.active = TRUE
     LEFT JOIN leagues l ON jc.entitytype = 'league' AND l.leagueid = jc.entityid AND COALESCE(l.active, TRUE) = TRUE
     WHERE jc.code = $1
       AND (g.groupid IS NOT NULL OR l.leagueid IS NOT NULL)`,
    [code]
  );
  if (!record) {
    res.status(404).json({ error: 'Join code not found.' });
    return;
  }

  res.json({ code, type: record.entitytype, id: record.entityid, name: record.name });
});
