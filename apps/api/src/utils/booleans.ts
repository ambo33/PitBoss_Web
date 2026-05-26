export function isDatabaseTrue(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 't';
}
