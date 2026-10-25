import { apiClient } from './api-client';

/**
 * The rubric: what this workspace judges people on.
 *
 * Deliberately short — six is the cap, enforced by the server. A rubric long
 * enough to be thorough is a rubric nobody fills in honestly at the end of a
 * sixty minute call.
 */

export interface Competency {
  id: string;
  name: string;
  description: string | null;
  position: number;
  active: boolean;
}

/** Where somebody stands on one competency, and which way they are moving. */
export interface CompetencyStanding {
  competencyId: string;
  /** The LATEST score, not an average: the question is where they are now. */
  score: number;
  first: number;
  times: number;
  trend: 'new' | 'up' | 'down' | 'flat';
}

export const competencyApi = {
  /** Seeds a usable rubric on first read, so nobody has to write one first. */
  list: () =>
    apiClient
      .get<{ data: { competencies: Competency[] } }>('/competencies')
      .then((r) => r.data.competencies),

  standing: (menteeIds: string[]) =>
    apiClient
      .get<{ data: { standing: Record<string, CompetencyStanding[]> } }>(
        `/competencies/standing?menteeIds=${encodeURIComponent(menteeIds.join(','))}`,
      )
      .then((r) => r.data.standing),

  create: (data: { name: string; description?: string }) =>
    apiClient.post<{ data: { competency: Competency } }>('/competencies', data).then((r) => r.data.competency),

  update: (id: string, data: Partial<Pick<Competency, 'name' | 'description' | 'active' | 'position'>>) =>
    apiClient.patch<{ data: { competency: Competency } }>(`/competencies/${id}`, data).then((r) => r.data.competency),

  /** Retires it. Scores already given stand. */
  retire: (id: string) => apiClient.delete(`/competencies/${id}`),
};
