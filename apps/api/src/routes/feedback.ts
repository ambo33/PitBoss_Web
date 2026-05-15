import { Router, Request, Response } from 'express';
import { query } from '../db';
import { requireAuth } from '../middleware/auth';

export const feedbackRouter = Router();
feedbackRouter.use(requireAuth);

feedbackRouter.post('/', async (req: Request, res: Response) => {
  const { type, message, pageurl, useragent } = req.body as {
    type?: string;
    message?: string;
    pageurl?: string;
    useragent?: string;
  };
  const normalizedType = ['issue', 'idea', 'question'].includes(String(type)) ? String(type) : 'issue';
  const cleanMessage = String(message ?? '').trim().slice(0, 2000);
  if (!cleanMessage) {
    res.status(400).json({ error: 'Tell us what happened or what you want to see.' });
    return;
  }

  const row = await query<{ id: string }>(
    `INSERT INTO feedback (userid, type, message, pageurl, useragent)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      req.userId,
      normalizedType,
      cleanMessage,
      pageurl ? String(pageurl).slice(0, 500) : null,
      useragent ? String(useragent).slice(0, 500) : null,
    ]
  );

  res.status(201).json({ success: true, id: row[0]?.id });
});
