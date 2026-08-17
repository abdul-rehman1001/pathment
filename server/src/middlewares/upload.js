const multer = require('multer');
const path = require('path');
const { ValidationError } = require('../utils/errors/errorTypes');

// Configure multer for memory storage
const storage = multer.memoryStorage();

// Allowed MIME types. Browsers are inconsistent about a few (notably .zip on
// Windows/Edge → application/x-zip-compressed, and some send octet-stream), so
// we ALSO accept by file extension below as a fallback.
const allowedTypes = [
  // Documents
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
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Video (demo recordings)
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
  'video/mpeg',
  'video/3gpp',
  // Audio. The browser records webm; a phone records AAC in an MP4 container,
  // which arrives as .m4a under any of the four names below depending on the
  // device. Leaving them out is what made every voice answer from the mobile
  // app fail with "File type not supported" after the mentee had already spoken.
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
  // Archives (incl. Windows/Edge .zip variants)
  'application/zip',
  'application/x-zip-compressed',
  'application/x-zip',
  'multipart/x-zip',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',
  'application/gzip',
  'application/x-tar',
  // Code files
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/json',
  'application/xml',
];

// Extension fallback for when the browser sends a vague/wrong MIME type.
const allowedExtensions = [
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.md',
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.mp4', '.mov', '.webm', '.avi', '.mkv', '.mpeg', '.mpg', '.3gp',
  '.mp3', '.wav', '.ogg', '.m4a', '.aac', '.amr', '.caf',
  '.zip', '.rar', '.7z', '.gz', '.tar',
  '.html', '.css', '.js', '.json', '.xml',
];

// File filter: accept by MIME type OR by extension (handles inconsistent
// browser MIME types). A rejection is a 400 (operational), not a 500.
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new ValidationError(`File type not supported: ${file.originalname || file.mimetype}. Please upload a document, image, video, archive, or code file.`), false);
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max file size
  }
});

// A larger-limit variant for media that can legitimately run big — e.g. a long
// interview voice answer (webm ≈ 1MB/min, so 10MB cut answers off ~10 min).
const uploadLarge = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB
  }
});

/**
 * Wrap a multer handler so size/count limits and filter rejections surface as
 * clean 400 messages instead of a generic 500 "Something went wrong on our end".
 */
const withUploadErrors = (handler) => (req, res, next) => {
  handler(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE: 'One of your files is too large. Please upload a smaller file.',
        LIMIT_FILE_COUNT: 'Too many files. Please upload fewer files.',
        LIMIT_UNEXPECTED_FILE: 'Unexpected file field in the upload.',
      };
      return next(new ValidationError(messages[err.code] || 'File upload failed. Please try again.'));
    }
    // fileFilter already throws a ValidationError; wrap anything unexpected.
    return next(err instanceof ValidationError ? err : new ValidationError(err.message || 'File upload failed. Please try again.'));
  });
};

upload.withUploadErrors = withUploadErrors;
/** `upload.arraySafe('files', 5)` — array upload with clean error messages. */
upload.arraySafe = (field, maxCount) => withUploadErrors(upload.array(field, maxCount));
/** `upload.singleSafe('file')` — single upload with clean error messages. */
upload.singleSafe = (field) => withUploadErrors(upload.single(field));
/** `upload.singleSafeLarge('audio')` — single upload with a 25MB cap. */
upload.singleSafeLarge = (field) => withUploadErrors(uploadLarge.single(field));
/**
 * Pictures and clips only, for the places that mean "show me what you saw".
 *
 * The shared filter is deliberately broad because a task submission can be a
 * zip of source or an html file. A feedback attachment cannot: both clients
 * only ever offer a screenshot or a short recording, so anything else arriving
 * there is either a mistake or somebody posting straight at the endpoint, and
 * neither should end up in the feedback folder.
 */
const mediaOnlyFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '');

  const looksLikeMedia =
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.mp4', '.mov', '.webm', '.3gp', '.mkv'].includes(ext);

  if (looksLikeMedia) return cb(null, true);

  cb(new ValidationError('Attach a screenshot or a short clip. Other files are not accepted here.'));
};

const uploadMedia = multer({
  storage: storage,
  fileFilter: mediaOnlyFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

/** `upload.singleSafeMedia('attachment')` — a picture or a clip, 10MB. */
upload.singleSafeMedia = (field) => withUploadErrors(uploadMedia.single(field));

/** Exposed so the accepted-type lists can be asserted directly in tests. */
upload.fileFilter = fileFilter;
upload.mediaOnlyFilter = mediaOnlyFilter;

module.exports = upload;
