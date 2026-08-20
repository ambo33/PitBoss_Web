const COMMUNITY_IMAGE_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,/i;
const MAX_COMMUNITY_IMAGE_BYTES = 1024 * 1024;

export function normalizeCommunityImage(
  value: unknown,
  filename: unknown
): { data: string | null; filename: string | null; error?: string } {
  if (value == null || value === '') return { data: null, filename: null };

  const imageData = typeof value === 'string' ? value.trim() : '';
  const imageFilename = typeof filename === 'string' ? filename.trim().slice(0, 160) : null;
  if (!COMMUNITY_IMAGE_PATTERN.test(imageData)) {
    return { data: null, filename: imageFilename, error: 'Community art must be a PNG, JPG, or WebP image.' };
  }

  const approxBytes = Math.ceil((imageData.split(',')[1] ?? '').length * 0.75);
  if (approxBytes > MAX_COMMUNITY_IMAGE_BYTES) {
    return { data: null, filename: imageFilename, error: 'Community art must be 1 MB or smaller.' };
  }

  return { data: imageData, filename: imageFilename };
}
