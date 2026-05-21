import crypto from 'crypto';

const PRIVATE_EMAIL_DOMAIN = 'private.thepokerplanner.com';

function getEncryptionKey(): Buffer {
  const material = process.env.EMAIL_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-secret';
  return crypto.createHash('sha256').update(material).digest();
}

export function normalizeEmail(email: string | null | undefined): string {
  return String(email ?? '').trim().toLowerCase();
}

export function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(normalizeEmail(email)).digest('hex');
}

export function encryptEmail(email: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(normalizeEmail(email), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const parts = value.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const [, iv, tag, encrypted] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

export function privateEmailPlaceholder(userId: string): string {
  return `private+${userId}@${PRIVATE_EMAIL_DOMAIN}`;
}

export function isPrivateEmailPlaceholder(email: string | null | undefined): boolean {
  return normalizeEmail(email).endsWith(`@${PRIVATE_EMAIL_DOMAIN}`);
}

export function isGuestEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email).startsWith('guest+') || isPrivateEmailPlaceholder(email);
}

export function publicEmail(encrypted: string | null | undefined, placeholder?: string | null): string {
  return decryptEmail(encrypted) ?? (placeholder && !isPrivateEmailPlaceholder(placeholder) ? placeholder : '');
}
