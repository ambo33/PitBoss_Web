const MAX_AVATAR_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_AVATAR_OUTPUT_BYTES = 1_450_000;
const MAX_AVATAR_EDGE = 768;
const MIN_AVATAR_EDGE = 192;
const SUPPORTED_AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export type PreparedAvatar = {
  dataUrl: string;
  filename: string;
};

export async function prepareAvatarImage(file: File): Promise<PreparedAvatar> {
  if (!SUPPORTED_AVATAR_TYPES.includes(file.type) && !/\.(png|jpe?g|webp|gif)$/i.test(file.name)) {
    throw new Error('Please choose a PNG, JPG, GIF, or WebP image.');
  }
  if (file.size > MAX_AVATAR_SOURCE_BYTES) {
    throw new Error('Choose an avatar image no larger than 25 MB.');
  }

  const decoded = await decodeAvatarImage(file);
  try {
    if (!decoded.width || !decoded.height) throw new Error('That image has invalid dimensions.');

    const initialScale = Math.min(1, MAX_AVATAR_EDGE / Math.max(decoded.width, decoded.height));
    let width = Math.max(1, Math.round(decoded.width * initialScale));
    let height = Math.max(1, Math.round(decoded.height * initialScale));

    while (true) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser could not prepare the avatar image.');

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(decoded.source, 0, 0, width, height);

      for (const quality of [0.86, 0.76, 0.66, 0.56, 0.46]) {
        const blob = await encodeAvatarCanvas(canvas, quality);
        if (blob.size <= MAX_AVATAR_OUTPUT_BYTES) {
          return {
            dataUrl: await blobToDataUrl(blob),
            filename: replaceImageExtension(file.name, blob.type === 'image/webp' ? 'webp' : 'jpg'),
          };
        }
      }

      if (Math.max(width, height) <= MIN_AVATAR_EDGE) break;
      const reduction = Math.max(MIN_AVATAR_EDGE / Math.max(width, height), 0.8);
      width = Math.max(1, Math.round(width * reduction));
      height = Math.max(1, Math.round(height * reduction));
    }
  } finally {
    decoded.release();
  }

  throw new Error('That image could not be compressed below 1.5 MB. Try a different image.');
}

async function encodeAvatarCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const webp = await canvasToBlob(canvas, 'image/webp', quality);
  if (webp?.type === 'image/webp') return webp;

  const jpegCanvas = document.createElement('canvas');
  jpegCanvas.width = canvas.width;
  jpegCanvas.height = canvas.height;
  const context = jpegCanvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the avatar image.');
  context.fillStyle = '#0f1014';
  context.fillRect(0, 0, jpegCanvas.width, jpegCanvas.height);
  context.drawImage(canvas, 0, 0);

  const jpeg = await canvasToBlob(jpegCanvas, 'image/jpeg', quality);
  if (!jpeg) throw new Error('This browser could not compress the avatar image.');
  return jpeg;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read the compressed avatar image.'));
    reader.readAsDataURL(blob);
  });
}

function replaceImageExtension(filename: string, extension: string) {
  const stem = filename.replace(/\.[^.]+$/, '').trim() || 'avatar';
  return `${stem}.${extension}`;
}

async function decodeAvatarImage(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to the broadly supported image element decoder.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image could not be opened.'));
    };
    image.src = url;
  });
}
