import { Request, Response, NextFunction } from 'express';
import { reportAutomaticIssueSafely } from '../services/issueReporter';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  console.error(err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  const status = typeof err === 'object' && err && 'status' in err
    ? Number((err as { status?: unknown }).status)
    : 500;
  const responseStatus = Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
  if (responseStatus >= 500) {
    res.setHeader('X-Issue-Reported', 'server');
    reportAutomaticIssueSafely({
      source: 'server',
      kind: responseStatus === 503 ? 'service_unavailable' : 'unhandled_api_error',
      message,
      method: req.method,
      requestPath: req.originalUrl,
      pageUrl: typeof req.headers.referer === 'string' ? req.headers.referer : null,
      status: responseStatus,
      userId: req.userId,
      userAgent: req.headers['user-agent'],
      stack: err instanceof Error ? err.stack : null,
    });
  }
  res.status(responseStatus).json({ error: message });
}
