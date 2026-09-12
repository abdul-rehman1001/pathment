import { apiClient } from './api-client';
import { apiConfig } from '@/lib/config/api';

// ── Task progress ───────────────────────────────────────────────────────────
export interface TaskProgressEntry {
  id: string;
  dateKey: string;
  note: string;
  minutesSpent: number | null;
  loggedAt: string;
  updatedAt: string;
}

export interface TaskProgressDay {
  dateKey: string;
  isToday: boolean;
  isFuture: boolean;
  /** Null means nothing was logged that day. The gaps are the signal, so they stay. */
  entry: TaskProgressEntry | null;
}

export interface TaskProgress {
  days: TaskProgressDay[];
  summary: {
    loggedDays: number;
    elapsedDays: number;
    /** The sentence a mentor reads, e.g. "logged 3 of 4 days". */
    label: string;
    lastNote: string | null;
    lastLoggedOn: string | null;
  };
}

export const menteeApi = {
  getAll: (filters?: { search?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.search) params.append('search', filters.search);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));
    const qs = params.toString();
    return apiClient.get(`${apiConfig.endpoints.mentees}${qs ? `?${qs}` : ''}`);
  },

  getById: (id: string) => {
    return apiClient.get(apiConfig.endpoints.menteeById(id));
  },

  // The logged-in mentee's own fairness read (My Progress).
  getMyProgress: () => apiClient.get('/mentee/progress'),

  // Daily check-in log.
  getDailyLog: () => apiClient.get('/mentee/daily-log'),
  saveDailyLog: (data: { dateKey: string; tasksDone: string[]; slotsDone?: string[]; note?: string }) =>
    apiClient.post('/mentee/daily-log', data),

  // ── Day-by-day progress on ONE task ──────────────────────────────────────
  // Writing here also logs the day in the daily log above, so the streak counts
  // work done where the work actually happens.
  getTaskProgress: (taskId: string) =>
    apiClient.get<{ data: TaskProgress }>(`/mentee/tasks/${taskId}/progress`),
  logTaskProgress: (taskId: string, note: string, minutesSpent?: number) =>
    apiClient.post<{ data: { entry: TaskProgressEntry } }>(`/mentee/tasks/${taskId}/progress`, { note, minutesSpent }),
  removeTaskProgress: (taskId: string, dateKey: string) =>
    apiClient.delete(`/mentee/tasks/${taskId}/progress/${dateKey}`),

  // Is the signed-in user's mentee side paused? Powers the paused gate.
  getPauseState: () => apiClient.get('/mentee/pause-state'),

  // Live cohort-review video (self-report attendance).
  getActiveReview: () => apiClient.get('/mentee/review/active'),
  joinReview: (sessionId: string, talkSeconds?: number) => apiClient.post(`/mentee/review/${sessionId}/join`, talkSeconds != null ? { talkSeconds } : {}),
  leaveReview: (sessionId: string, seconds: number) => apiClient.post(`/mentee/review/${sessionId}/leave`, { seconds }),

  deleteUser: (id: string) => {
    return apiClient.delete(`/admin/users/${id}`);
  },

  suspendUser: (id: string) => {
    return apiClient.put(`/admin/users/${id}/suspend`, {});
  },

  unsuspendUser: (id: string) => {
    return apiClient.put(`/admin/users/${id}/unsuspend`, {});
  },
};
