import { createHash } from 'crypto';
import { query } from '../db';

export type AutomaticIssueSource = 'client' | 'server' | 'server_runtime';

export interface AutomaticIssueInput {
  source: AutomaticIssueSource;
  kind: string;
  message: string;
  method?: string | null;
  requestPath?: string | null;
  pageUrl?: string | null;
  status?: number | null;
  userId?: string | null;
  userAgent?: string | null;
  stack?: string | null;
}

const SECRET_PATTERN = /(password|token|secret|api[_-]?key)(\s*[:=]?\s*)([^\s,;]+)/gi;

export function sanitizeIssueText(value: unknown, maxLength = 2000): string {
  return String(value ?? '')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/Authorization\s*[:=]\s*(?!Bearer\b)[^\s,;]+/gi, 'Authorization: [redacted]')
    .replace(SECRET_PATTERN, '$1$2[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeIssuePath(value: unknown): string {
  const raw = sanitizeIssueText(value, 500);
  if (!raw) return '';
  try {
    const parsed = new URL(raw, 'https://app.thepokerplanner.com');
    return parsed.pathname.slice(0, 500);
  } catch {
    return raw.split('?')[0].slice(0, 500);
  }
}

export function normalizeIssuePath(value: unknown): string {
  return sanitizeIssuePath(value)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ':id')
    .replace(/\b\d{6}\b/g, ':code');
}

export function buildIssueFingerprint(input: AutomaticIssueInput): string {
  const parts = [
    input.source,
    sanitizeIssueText(input.kind, 80).toLowerCase(),
    sanitizeIssueText(input.method ?? 'UNKNOWN', 12).toUpperCase(),
    normalizeIssuePath(input.requestPath ?? input.pageUrl),
    typeof input.status === 'number' && Number.isFinite(input.status) ? String(input.status) : '',
    sanitizeIssueText(input.message, 500).toLowerCase(),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

function issueLabel(kind: string): string {
  return kind
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function reportAutomaticIssue(input: AutomaticIssueInput): Promise<void> {
  const kind = sanitizeIssueText(input.kind || 'unexpected_error', 80) || 'unexpected_error';
  const method = sanitizeIssueText(input.method ?? '', 12).toUpperCase();
  const requestPath = sanitizeIssuePath(input.requestPath ?? input.pageUrl) || 'unknown location';
  const errorMessage = sanitizeIssueText(input.message || 'Unknown error', 1000) || 'Unknown error';
  const status = typeof input.status === 'number' && Number.isFinite(input.status) ? input.status : null;
  const fingerprint = buildIssueFingerprint({ ...input, kind, message: errorMessage, method, requestPath, status });
  const summary = `[Automatic ${issueLabel(kind)}] ${method ? `${method} ` : ''}${requestPath}: ${errorMessage}`.slice(0, 2000);
  const details = {
    source: input.source,
    kind,
    method: method || null,
    requestPath,
    status,
    stack: sanitizeIssueText(input.stack, 2000) || null,
  };

  await query(
    `INSERT INTO feedback (
       userid, type, message, pageurl, useragent, source, fingerprint,
       occurrencecount, lastoccurredat, details
     )
     VALUES ($1, 'issue', $2, $3, $4, $5, $6, 1, now(), $7::JSONB)
     ON CONFLICT (fingerprint) DO UPDATE SET
       userid = COALESCE(EXCLUDED.userid, feedback.userid),
       message = EXCLUDED.message,
       pageurl = EXCLUDED.pageurl,
       useragent = EXCLUDED.useragent,
       occurrencecount = feedback.occurrencecount + 1,
       lastoccurredat = now(),
       details = EXCLUDED.details,
       status = 'new'`,
    [
      input.userId ?? null,
      summary,
      sanitizeIssuePath(input.pageUrl) || null,
      sanitizeIssueText(input.userAgent, 500) || null,
      input.source,
      fingerprint,
      JSON.stringify(details),
    ]
  );
}

export function reportAutomaticIssueSafely(input: AutomaticIssueInput): void {
  void reportAutomaticIssue(input).catch((error) => {
    console.error('Failed to record automatic issue', error);
  });
}
