export type ClientIssueKind =
  | 'request_timeout'
  | 'network_error'
  | 'server_response'
  | 'browser_error'
  | 'unhandled_promise_rejection';

export interface ClientIssueInput {
  kind: ClientIssueKind;
  message: string;
  method?: string;
  requestPath?: string;
  status?: number;
  stack?: string;
}

const REPORT_COOLDOWN_MS = 60_000;
const recentlyReported = new Map<string, number>();

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/Authorization\s*[:=]\s*(?!Bearer\b)[^\s,;]+/gi, 'Authorization: [redacted]')
    .replace(/(password|token|secret|api[_-]?key)(\s*[:=]?\s*)([^\s,;]+)/gi, '$1$2[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function pageWithoutSensitiveQuery(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function shouldReport(signature: string): boolean {
  const now = Date.now();
  const lastReported = recentlyReported.get(signature) ?? 0;
  if (now - lastReported < REPORT_COOLDOWN_MS) return false;
  recentlyReported.set(signature, now);
  return true;
}

export function reportClientIssue(input: ClientIssueInput): void {
  const message = cleanText(input.message, 1000);
  if (!message) return;
  const requestPath = cleanText(input.requestPath, 500).split('?')[0];
  const signature = [input.kind, input.method, requestPath, input.status, message].join('|');
  if (!shouldReport(signature)) return;

  const token = localStorage.getItem('pb_token');
  void fetch('/api/feedback/automatic', {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      kind: input.kind,
      message,
      method: cleanText(input.method, 12) || undefined,
      requestpath: requestPath || undefined,
      pageurl: pageWithoutSensitiveQuery(),
      status: input.status,
      useragent: navigator.userAgent,
      stack: cleanText(input.stack, 2000) || undefined,
    }),
  }).catch(() => {
    // Error reporting must never interrupt the user's current action.
  });
}

export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (event) => {
    const source = event.filename ? `Source: ${event.filename}` : '';
    const stack = event.error instanceof Error ? event.error.stack : '';
    reportClientIssue({
      kind: 'browser_error',
      message: event.message || 'Unhandled browser error',
      requestPath: window.location.pathname,
      stack: [source, stack].filter(Boolean).join(' '),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportClientIssue({
      kind: 'unhandled_promise_rejection',
      message: reason instanceof Error ? reason.message : String(reason ?? 'Unhandled promise rejection'),
      requestPath: window.location.pathname,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
