const PENDING_GROUP_INVITE_KEY = 'pitboss-pending-group-invite';

export function setPendingGroupInvite(inviteCode: string) {
  localStorage.setItem(PENDING_GROUP_INVITE_KEY, inviteCode.trim().toUpperCase());
}

export function getPendingGroupInvite(): string | null {
  return localStorage.getItem(PENDING_GROUP_INVITE_KEY);
}

export function clearPendingGroupInvite() {
  localStorage.removeItem(PENDING_GROUP_INVITE_KEY);
}
