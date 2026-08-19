export type LoadedImage = {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  name: string;
};

export const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp';

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class UnsupportedImageError extends Error {}

export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (!ACCEPTED.has(file.type)) {
    throw new UnsupportedImageError(
      `${file.name || 'That file'} is not a JPEG, PNG or WebP. Convert it first and try again.`,
    );
  }

  // imageOrientationFromExif keeps phone photos the right way up; without it a
  // portrait shot arrives rotated and every aspect-dependent effect is wrong.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return { bitmap, width: bitmap.width, height: bitmap.height, name: file.name };
}

export type ExportFormat = 'jpeg' | 'png';

const MIME: Record<ExportFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export async function pixelsToBlob(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  format: ExportFormat,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get a 2D context to encode the image.');
  ctx.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, MIME[format], format === 'jpeg' ? 0.95 : undefined);
  });
  if (!blob) throw new Error('The browser refused to encode the image.');
  return blob;
}

export function exportFilename(sourceName: string, format: ExportFormat): string {
  const stem = sourceName.replace(/\.[^.]+$/, '') || 'image';
  return `${stem}_emulsion.${format === 'jpeg' ? 'jpg' : 'png'}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next frame — revoking synchronously can cancel the download.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}
