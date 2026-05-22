import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  console.error(err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  const status = typeof err === 'object' && err && 'status' in err
    ? Number((err as { status?: unknown }).status)
    : 500;
  res.status(Number.isInteger(status) && status >= 400 && status < 600 ? status : 500).json({ error: message });
}
