import { apiClient } from './api-client';

/** One mentee's place in the data's own ranking of a clan or programme. */
export interface PerformanceRankRow {
  menteeId: string;
  mentee: { id: string; firstName: string; lastName: string; email: string; profilePictureUrl?: string | null } | null;
  clanId: string | null;
  clanName: string | null;
  rank: number;
  score: number;
  signals: PerformanceSignals;
}

export interface PerformanceSignals {
  tasksCompleted: number;
  tasksTotal: number;
  completionRate: number;
  onTimeRate: number;
  avgRating: number | null;
  openBlockers: number;
  blockersResolved: number;
  attendancePct: number | null;
}

export interface PerformanceNomination {
  id: string;
  menteeId: string;
  mentee: { id: string; firstName: string; lastName: string; email: string; profilePictureUrl?: string | null } | null;
  programId: string;
  clanId: string | null;
  clanName: string | null;
  level: 'clan' | 'fellowship';
  /** The mentor's own words. Required of them at nomination. */
  reasoning: string | null;
  nominatedBy: string | null;
  /** Where the data placed this mentee when the nomination was made. */
  systemRank: number | null;
  systemOutOf: number | null;
  systemSignals: PerformanceSignals | null;
  status: 'nominated' | 'shortlisted' | 'awarded' | 'declined';
  decisionNote: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export const topPerformersApi = {
  /** The data's ranking — computed on read, never a stale snapshot. */
  ranking: (opts: { programId?: string | null; clanId?: string | null; limit?: number }) => {
    const qs = new URLSearchParams({ limit: String(opts.limit ?? 50) });
    if (opts.programId) qs.set('programId', opts.programId);
    const clanId = opts.clanId;
    if (clanId) qs.set('clanId', clanId);
    return apiClient.get<{ success: boolean; data: PerformanceRankRow[] }>(
      `/top-performers/ranking?${qs.toString()}`
    );
  },

  list: (programId?: string | null, status?: string | null) => {
    const qs = new URLSearchParams();
    if (programId) qs.set('programId', programId);
    if (status) qs.set('status', status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiClient.get<{ success: boolean; data: PerformanceNomination[] }>(`/top-performers${suffix}`);
  },

  /** Put somebody forward. The server refuses this without reasoning. */
  nominate: (menteeId: string, body: { programId?: string | null; clanId?: string | null; level?: 'clan' | 'fellowship'; reasoning: string }) =>
    apiClient.post<{ success: boolean; data: PerformanceNomination }>(`/top-performers/${menteeId}`, body),

  /** A first draft from the mentee's numbers, for the mentor to edit. */
  draft: (menteeId: string, body: { programId?: string | null; clanId?: string | null }) =>
    apiClient.post<{ success: boolean; data: { draft: string; rank: number; outOf: number; signals: PerformanceSignals } }>(
      `/top-performers/${menteeId}/draft`, body, { timeout: 60000 }
    ),

  decide: (id: string, body: { status: 'shortlisted' | 'awarded' | 'declined'; decisionNote?: string }) =>
    apiClient.patch<{ success: boolean; data: PerformanceNomination }>(`/top-performers/${id}/decision`, body),
};
