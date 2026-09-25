/**
 * The owner's own photos live in file storage, outside the ledger; an item stores only the name
 * `u-<content hash>-<width>x<height>`, where the size is that of the largest stored WebP.
 */
export const uploadedPhotoPattern = /^u-[0-9a-f]{12}-(\d{1,5})x(\d{1,5})$/;
export const uploadedPhotoValid = (value: unknown): value is string =>
  typeof value === 'string' && uploadedPhotoPattern.test(value);
/** Largest stored width: enough for a 320 px card on a 2x screen. */
export const uploadedPhotoMaxWidth = 640;
export const uploadedPhotoMinWidth = 160;
/** Stored widths for a photo whose largest variant is `width` wide, never enlarged. */
export const uploadedPhotoWidths = (width: number) =>
  [...new Set([160, 320, width].filter((w) => w <= width))].sort((a, b) => a - b);
export const uploadedPhotoFile = (name: string, width: number) => `${name}-${width}.webp`;
export const uploadedPhotoUrl = (name: string, width: number) =>
  `/api/photos/${uploadedPhotoFile(name, width)}`;
/** The item with the owner's photo set, or with the field removed, so saving clears it on the server. */
export function withPhoto<T extends { photo?: string }>(item: T, photo?: string): T {
  const next = { ...item };
  if (photo) next.photo = photo;
  else delete next.photo;
  return next;
}
export function uploadedPhotoSize(name: string) {
  const match = uploadedPhotoPattern.exec(name);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : undefined;
}
