const PENDING_GROUP_INVITE_KEY = 'pitboss-pending-group-invite';
const PENDING_JOIN_PATH_KEY = 'pokerplanner-pending-join-path';

export function normalizeGroupInviteCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/^ +| +$/g, '')
    .replace(/ {2,}/g, ' ')
    .slice(0, 10);
}

export function formatGroupInviteCodeInput(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .slice(0, 10);
}

export function normalizeJoinPath(value: string | null | undefined): string | null {
  const path = String(value ?? '').trim();
  if (!path.startsWith('/join/') || path.startsWith('//')) return null;
  return path;
}

export function setPendingJoinPath(path: string) {
  const normalized = normalizeJoinPath(path);
  if (normalized) localStorage.setItem(PENDING_JOIN_PATH_KEY, normalized);
}

export function getPendingJoinPath(): string | null {
  return normalizeJoinPath(localStorage.getItem(PENDING_JOIN_PATH_KEY));
}

export function clearPendingJoinPath() {
  localStorage.removeItem(PENDING_JOIN_PATH_KEY);
}

export function setPendingGroupInvite(inviteCode: string) {
  localStorage.setItem(PENDING_GROUP_INVITE_KEY, normalizeGroupInviteCode(inviteCode));
}

export function getPendingGroupInvite(): string | null {
  return localStorage.getItem(PENDING_GROUP_INVITE_KEY);
}

export function clearPendingGroupInvite() {
  localStorage.removeItem(PENDING_GROUP_INVITE_KEY);
}
