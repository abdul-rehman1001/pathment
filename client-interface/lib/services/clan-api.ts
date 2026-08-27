import { apiClient } from './api-client';

/** Clans - mentor-led groups inside a program (admin management + assignment). */
export const clanApi = {
  /** No page/limit → full program-scoped list (for pickers/dropdowns).
   *  Pass page/limit for the server-paginated admin list ({ clans, total, … }). */
  list: (params: { programId?: string; status?: string; search?: string; page?: number; limit?: number } = {}) =>
    apiClient.get('/clans', { params }),
  /** Org-wide clan-health snapshot grouped by program (admin dashboard). */
  health: () => apiClient.get('/clans/health'),
  /** Org insights - clan comparison + fairness lens (admin /admin/insights). */
  insights: () => apiClient.get('/clans/insights'),
  /** Programs the current mentor runs, with their clans + roster counts. */
  mentorPrograms: () => apiClient.get('/clans/mentor/programs'),
  /** The current user's active clan memberships (with role per clan). */
  myMemberships: () => apiClient.get('/clans/me/memberships'),
  get: (id: string) => apiClient.get(`/clans/${id}`),
  create: (data: {
    programId: string;
    name: string;
    description?: string;
    leadMentorId?: string;
    levelLabel?: string;
    tags?: string[];
    levels?: string[];
    countries?: string[];
    maxMentees?: number;
  }) => apiClient.post('/clans', data),
  update: (id: string, data: Record<string, unknown>) => apiClient.patch(`/clans/${id}`, data),
  addMember: (id: string, userId: string, role: 'lead_mentor' | 'co_mentor' | 'mentee' | 'core_team') =>
    apiClient.post(`/clans/${id}/members`, { userId, role }),
  /** Clan-scoped mentor capabilities for the current user (matches server guards). */
  myClanAccess: (id: string) => apiClient.get(`/clans/${id}/members/me/access`),
  /** Drops one clan role. A member who is both a mentee and a co-mentor of this
   *  clan keeps the other role — omit `role` only to evict them from the clan. */
  removeMember: (id: string, userId: string, role?: 'lead_mentor' | 'co_mentor' | 'mentee' | 'core_team') =>
    apiClient.delete(`/clans/${id}/members/${userId}`, { params: role ? { role } : {} }),
  /** A co-mentor's current toggle state: { keys, denied }. Works for co-mentors
   *  from any source (team membership / cross-clan cover / IAM grant). */
  getMemberPermissions: (id: string, userId: string) =>
    apiClient.get(`/clans/${id}/members/${userId}/permissions`),
  /** Fine-tune one co-mentor's permissions in a clan. `denied` is the subset of
   *  co-mentor default permissions to revoke (empty = full parity). */
  setMemberPermissions: (id: string, userId: string, denied: string[]) =>
    apiClient.patch(`/clans/${id}/members/${userId}/permissions`, { denied }),
  // Lead mentor: list unassigned mentees + invite a new one straight into the clan.
  availableMembers: (id: string, q?: string) => apiClient.get(`/clans/${id}/available`, { params: q ? { q } : {} }),
  // Anyone active (mentor OR mentee) not already a mentor in this clan — searchable
  // candidate pool for adding a co-mentor / core-team member (incl. re-adding a removed one).
  candidates: (id: string, q?: string) => apiClient.get(`/clans/${id}/candidates`, { params: q ? { q } : {} }),
  inviteToClan: (id: string, email: string) => apiClient.post(`/clans/${id}/invite`, { email }),
  /** Move a mentee to a different clan (admin). Same program keeps progress; a
   *  different program wipes the old enrollment + tasks (clean transfer). */
  reassign: (menteeId: string, toClanId: string) => apiClient.post('/clans/reassign', { menteeId, toClanId }),

  // ── Public clan joining link ─────────────────────────────────────────────
  getPublicJoinState: (id: string) =>
    apiClient.get<any>(`/clans/${id}/public-join`).then((r) => r.data as PublicJoinState),
  setPublicJoinAccess: (id: string, allowed: boolean) =>
    apiClient.patch<any>(`/clans/${id}/public-join/access`, { allowed }).then((r) => r.data as PublicJoinState),
  generatePublicJoinLink: (id: string) =>
    apiClient.post<any>(`/clans/${id}/public-join/link`, {}).then((r) => r.data as PublicJoinState),
  disablePublicJoinLink: (id: string) =>
    apiClient.delete<any>(`/clans/${id}/public-join/link`).then((r) => r.data as PublicJoinState),
  regeneratePublicJoinLink: (id: string) =>
    apiClient.post<any>(`/clans/${id}/public-join/regenerate`, {}).then((r) => r.data as PublicJoinState),
  listJoinRequests: (id: string, status?: string) =>
    apiClient.get<any>(`/clans/${id}/join-requests`, { params: status ? { status } : {} })
      .then((r) => (r.data?.requests || []) as ClanJoinRequestRow[]),
  approveJoinRequest: (id: string, requestId: string) =>
    apiClient.post<any>(`/clans/${id}/join-requests/${requestId}/approve`, {}),
  rejectJoinRequest: (id: string, requestId: string, note?: string) =>
    apiClient.post<any>(`/clans/${id}/join-requests/${requestId}/reject`, note ? { note } : {}),
};

export interface PublicJoinState {
  clanId?: string;
  clanName?: string;
  publicJoinAllowed: boolean;
  publicJoinEnabled: boolean;
  publicJoinLinkExists: boolean;
  publicJoinUsable?: boolean;
  publicJoinUrl: string | null;
}

export interface ClanJoinRequestRow {
  id: string;
  clanId: string;
  userId: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  source: string;
  message?: string | null;
  resolutionNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  user?: { id: string; firstName: string; lastName: string; email: string } | null;
}
