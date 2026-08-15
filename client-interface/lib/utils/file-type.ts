/**
 * Pure file-type helpers. Keep these framework-free so any module (components,
 * hooks, utilities) can classify a file without coupling to rendering.
 */

/** True when the MIME type is an image we can preview inline. */
export function isImageFile(fileType?: string | null): boolean {
  return Boolean(fileType && fileType.startsWith('image/'));
}