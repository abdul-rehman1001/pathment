import { apiClient } from './api-client';

/** One row of a cohort's assessment pool (level-aware, randomly assigned). */
export interface CohortAssessmentItem {
  id: string;
  assessmentId: string;
  level: string | null;
  position: number;
  assessment: { id: string; title: string; status: string } | null;
}

/** Cohorts - a program's intake batch/season. Admin-only. */
export const cohortApi = {
  list: (params?: { programId?: string; status?: string }) =>
    apiClient.get('/intake/cohorts', { params }),
  get: (id: string) => apiClient.get(`/intake/cohorts/${id}`),
  create: (data: {
    programId: string;
    name: string;
    description?: string;
    status?: string;
  }) => apiClient.post('/intake/cohorts', data),
  update: (id: string, data: Record<string, unknown>) =>
    apiClient.patch(`/intake/cohorts/${id}`, data),
  /** Turn the public self-serve intake link on (mints a slug) - returns { cohort, applyUrl }. */
  enablePublicLink: (id: string) => apiClient.post(`/intake/cohorts/${id}/public-link`, {}),
  disablePublicLink: (id: string) => apiClient.delete(`/intake/cohorts/${id}/public-link`),
  /** Copy form + assessment config from another cohort. */
  cloneIntake: (id: string, sourceCohortId: string) =>
    apiClient.post(`/intake/cohorts/${id}/clone-intake`, { sourceCohortId }),
  /** Get-or-create this cohort's assessment (returns { assessment }). */
  ensureAssessment: (id: string) => apiClient.post(`/intake/cohorts/${id}/assessment`, {}),
  /** The cohort's assessment pool (multiple, optionally per-level). */
  getAssessments: (id: string) =>
    apiClient.get<{ data: { pool: CohortAssessmentItem[] } }>(`/intake/cohorts/${id}/assessments`),
  /** Replace the whole pool. items: [{ assessmentId, level? }] (level null = everyone). */
  setAssessments: (id: string, items: { assessmentId: string; level?: string | null }[]) =>
    apiClient.put<{ data: { pool: CohortAssessmentItem[] } }>(`/intake/cohorts/${id}/assessments`, { items }),
};

/** Applications - intake records inside a cohort. Admin-only. */
export const applicationApi = {
  list: (cohortId: string, status?: string) =>
    apiClient.get(`/intake/cohorts/${cohortId}/applications`, { params: { status } }),
  /** Full detail incl. attached assessment + the applicant's submission. */
  get: (id: string) => apiClient.get(`/intake/applications/${id}`),
  /** Set/override the manual + total score for an assessment submission. */
  gradeSubmission: (submissionId: string, data: { manualScore?: number; totalScore?: number }) =>
    apiClient.post(`/intake/assessment-submissions/${submissionId}/grade`, data),
  /** Bulk import header→value rows parsed client-side from a CSV. `allowExceed`
   *  overrides the cohort's application cap (skips it). */
  import: (cohortId: string, rows: Record<string, string>[], allowExceed = false) =>
    apiClient.post(`/intake/cohorts/${cohortId}/applications/import`, { rows, allowExceed }),
  create: (cohortId: string, data: Record<string, unknown>) =>
    apiClient.post(`/intake/cohorts/${cohortId}/applications`, data),
  update: (id: string, data: { status?: string; assessmentScore?: number; reviewerNotes?: string; decisionReason?: string }) =>
    apiClient.patch(`/intake/applications/${id}`, data),
  accept: (id: string, clanId?: string) =>
    apiClient.post(`/intake/applications/${id}/accept`, { clanId }),
  reject: (id: string, reason?: string) =>
    apiClient.post(`/intake/applications/${id}/reject`, { reason }),
  /** Accept + invite a batch of selected applicants (emails go out — irreversible).
   *  Idempotent: already-accepted / registered / withdrawn are skipped with a reason. */
  bulkAccept: (cohortId: string, applicationIds: string[], clanId?: string) =>
    apiClient.post(`/intake/cohorts/${cohortId}/applications/bulk-accept`, { applicationIds, clanId }, { timeout: 120000 }),

  // ── AI scoring ──────────────────────────────────────────────────────────
  /** AI-score a batch of applicants' open-ended answers + a holistic score.
   *  The client pages through selected rows so a big cohort never times out. */
  aiGrade: (cohortId: string, applicationIds: string[]) =>
    apiClient.post(`/intake/cohorts/${cohortId}/ai-grade`, { applicationIds }, { timeout: 120000 }),
  /** AI-score one submission (from the review drawer). */
  aiGradeSubmission: (submissionId: string) =>
    apiClient.post(`/intake/assessment-submissions/${submissionId}/ai-grade`, {}, { timeout: 60000 }),
  /** Commit the AI's suggested per-question scores to the real score. */
  applyAi: (submissionId: string) =>
    apiClient.post(`/intake/assessment-submissions/${submissionId}/apply-ai`, {}),

  // ── CSV score round-trip ────────────────────────────────────────────────
  /** Download the applications sheet (auth'd) and trigger a browser save. */
  exportCsv: async (cohortId: string, cohortName: string, ids?: string[]) => {
    // POST so the (possibly long) id list of the filtered view fits — the sheet
    // then contains exactly the rows the admin is looking at.
    const data = await apiClient.post<Blob>(
      `/intake/cohorts/${cohortId}/applications/export`,
      ids && ids.length ? { ids } : {},
      { responseType: 'blob', timeout: 120000 },
    );
    const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: 'text/csv;charset=utf-8' });
    const safe = (cohortName || 'cohort').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const stamp = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `applications-${safe}-${stamp}.csv`;
    document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  },
  /** Preview an edited sheet (diff, no writes). */
  previewScoreImport: (cohortId: string, csv: string) =>
    apiClient.post(`/intake/cohorts/${cohortId}/scores/import/preview`, { csv }),
  /** Apply the edited sheet (writes the changed scores/status/notes). */
  applyScoreImport: (cohortId: string, csv: string) =>
    apiClient.post(`/intake/cohorts/${cohortId}/scores/import/apply`, { csv }),
};
