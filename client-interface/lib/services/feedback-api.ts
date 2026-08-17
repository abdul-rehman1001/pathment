import axiosInstance from './axios-instance';
import { apiClient } from './api-client';

export type FeedbackType = 'bug' | 'suggestion' | 'other';
export type FeedbackStatus = 'open' | 'in_review' | 'planned' | 'fixed' | 'added' | 'declined';

export interface FeedbackReport {
  id: string;
  type: FeedbackType; typeLabel: string;
  title: string; description: string | null;
  status: FeedbackStatus; statusLabel: string;
  priority: 'low' | 'normal' | 'high';
  /** Where it happened. Without it every report needs a reply before a fix. */
  platform: 'web' | 'android' | 'ios' | null; platformLabel: string | null;
  appVersion: string | null; device: string | null;
  pageUrl: string | null; userAgent: string | null;
  attachmentUrl: string | null; attachmentType: 'image' | 'video' | 'file' | null; attachmentName: string | null;
  resolutionNote: string | null;
  reporter: { id: string; name: string; email: string; role: string | null } | null;
  handledAt: string | null; createdAt: string; updatedAt: string;
}

export const feedbackApi = {
  /** Submit feedback / a bug report (optional screenshot or short clip). */
  submit: (data: { type: FeedbackType; title: string; description?: string; pageUrl?: string; userAgent?: string; file?: File | null }) => {
    const fd = new FormData();
    fd.append('type', data.type);
    fd.append('title', data.title);
    if (data.description) fd.append('description', data.description);
    if (data.pageUrl) fd.append('pageUrl', data.pageUrl);
    if (data.userAgent) fd.append('userAgent', data.userAgent);
    // Said outright rather than left for the server to sniff from the user
    // agent. The app says the same about itself, and an admin who cannot tell
    // the two apart has to ask before they can start on anything.
    fd.append('platform', 'web');
    if (data.file) fd.append('attachment', data.file);
    // Browser sets the multipart boundary; don't pin Content-Type.
    return axiosInstance.post('/feedback', fd);
  },
  /** The current user's own reports + status. */
  listMine: () => apiClient.get<{ data: { reports: FeedbackReport[] } }>('/feedback/mine'),
  /** Admin triage list. */
  listAll: (params?: { status?: string; type?: string; page?: number; limit?: number }) =>
    apiClient.get<{ data: { reports: FeedbackReport[]; total: number; page: number; limit: number; openCount: number } }>('/feedback', { params }),
  /** Admin: update status / reply. */
  update: (id: string, data: { status?: FeedbackStatus; resolutionNote?: string; priority?: string }) =>
    apiClient.patch<{ data: { report: FeedbackReport } }>(`/feedback/${id}`, data),
};
