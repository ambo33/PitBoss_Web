import { Router, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { query } from '../db';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { reportAutomaticIssue } from '../services/issueReporter';

export const feedbackRouter = Router();
const automaticIssueLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

feedbackRouter.post('/automatic', automaticIssueLimiter, optionalAuth, async (req: Request, res: Response) => {
  const { kind, message, method, requestpath, pageurl, status, useragent, stack } = req.body as {
    kind?: string;
    message?: string;
    method?: string;
    requestpath?: string;
    pageurl?: string;
    status?: number;
    useragent?: string;
    stack?: string;
  };
  if (!String(message ?? '').trim()) {
    res.status(400).json({ error: 'Issue message is required.' });
    return;
  }

  await reportAutomaticIssue({
    source: 'client',
    kind: String(kind ?? 'unexpected_client_error'),
    message: String(message),
    method,
    requestPath: requestpath,
    pageUrl: pageurl,
    status: Number.isFinite(Number(status)) ? Number(status) : null,
    userId: req.userId,
    userAgent: useragent ?? req.headers['user-agent'],
    stack,
  });
  res.status(202).json({ success: true });
});

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
