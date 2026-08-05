export const GROUP_INVITE_CODE_MAX_LENGTH = 10;

const RANDOM_INVITE_CODE_LENGTH = 6;
const INVITE_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VALID_INVITE_CODE = /^[A-Z0-9 ]{1,10}$/;

export function generateGroupInviteCode(length = RANDOM_INVITE_CODE_LENGTH): string {
  return Array.from(
    { length },
    () => INVITE_CODE_CHARACTERS[Math.floor(Math.random() * INVITE_CODE_CHARACTERS.length)]
  ).join('');
}

export function normalizeGroupInviteCode(value: string | undefined): string {
  return (value ?? '')
    .toUpperCase()
    .replace(/^ +| +$/g, '')
    .replace(/ {2,}/g, ' ');
}

export function isValidGroupInviteCode(value: string): boolean {
  return VALID_INVITE_CODE.test(value);
}
