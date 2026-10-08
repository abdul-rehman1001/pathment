/**
 * Mentee task-submission file rules — keep in sync with
 * `server/src/middlewares/upload.js` (allowedTypes / allowedExtensions / 10MB).
 */

export const SUBMISSION_MAX_FILES = 5;
export const SUBMISSION_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/** Extensions the server accepts (lowercase, with leading dot). */
export const SUBMISSION_ALLOWED_EXTENSIONS = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.md',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.mp4', '.mov', '.webm', '.avi', '.mkv', '.mpeg', '.mpg', '.3gp',
  '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.amr', '.caf',
  '.zip', '.rar', '.7z', '.gz', '.tar',
  '.html', '.css', '.js', '.json', '.xml',
] as const;

/** MIME types the server accepts (in addition to extension fallback). */
export const SUBMISSION_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
  'video/mpeg',
  'video/3gpp',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
  'audio/aac',
  'audio/3gpp',
  'audio/amr',
  'audio/x-caf',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'multipart/x-zip',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',
  'application/gzip',
  'application/x-tar',
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/json',
  'application/xml',
] as const;

/**
 * Value for `<input accept>` / FileDragDrop.
 * Extensions drive the OS picker filter; MIME types cover browsers that leave
 * `file.type` set but send a vague or missing extension.
 */
export const SUBMISSION_FILE_ACCEPT = [
  ...SUBMISSION_ALLOWED_EXTENSIONS,
  ...SUBMISSION_ALLOWED_MIME_TYPES,
].join(',');

export const SUBMISSION_FILE_HINT =
  'Documents, images, video, audio, archives, or code — max 5 files, 10MB each';

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

/** True when the file would pass the server upload filter. */
export function isAcceptedSubmissionFile(file: File): boolean {
  const ext = extensionOf(file.name || '');
  if (ext && (SUBMISSION_ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return true;
  }
  const mime = (file.type || '').toLowerCase();
  return Boolean(mime && (SUBMISSION_ALLOWED_MIME_TYPES as readonly string[]).includes(mime));
}

export function formatMaxSizeMb(maxSizeBytes: number): number {
  return Math.round(maxSizeBytes / (1024 * 1024));
}

/**
 * Human reason a file cannot be attached, or null if it is fine.
 * Filename characters/length are not restricted — only type and size.
 */
export function getSubmissionFileRejectReason(
  file: File,
  maxSizeBytes: number = SUBMISSION_MAX_FILE_SIZE
): string | null {
  if (maxSizeBytes > 0 && file.size > maxSizeBytes) {
    return `File "${file.name}" is too large (max ${formatMaxSizeMb(maxSizeBytes)}MB).`;
  }
  if (!isAcceptedSubmissionFile(file)) {
    return `File "${file.name}" is not supported. Please upload a document, image, video, audio, archive, or code file.`;
  }
  return null;
}
