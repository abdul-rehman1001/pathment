// Submission-related types.

/**
 * A file attached to a task submission.
 *
 * This is the minimal shape every submission-file source must satisfy (task
 * submissions, review queue items, …). Components depend on this abstraction
 * rather than on concrete API response shapes.
 */
export interface SubmissionFile {
  id: string | number;
  fileName: string;
  fileUrl: string;
  /** MIME type, e.g. "image/png". May be absent for legacy rows. */
  fileType?: string | null;
  fileSizeBytes?: number | null;
}