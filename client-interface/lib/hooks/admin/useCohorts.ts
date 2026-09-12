'use client';

import { qk, useApiQuery } from '@/lib/query';
import { cohortApi } from '@/lib/services/intake-api';

export type CohortStatus = 'planning' | 'open' | 'closed' | 'running' | 'completed';

export interface Cohort {
  id: string;
  programId: string;
  name: string;
  description?: string | null;
  status: CohortStatus;
  capacity?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  // Intake configuration (present on the cohort detail fetch).
  levels?: { key: string; label: string }[];
  timezone?: string | null;
  maxApplications?: number | null;
  applyOpensAt?: string | null;
  applyClosesAt?: string | null;
  publicEnabled?: boolean;
  publicSlug?: string | null;
  assessmentId?: string | null;
  assessmentRequired?: boolean;
  intakeFormSchema?: unknown[];
  program?: { id: string; name: string } | null;
  applicationCount?: number;
  applicationsByStatus?: Record<string, number>;
}

export interface UseCohortsReturn {
  cohorts: Cohort[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const EMPTY: Cohort[] = [];

export function useCohorts(programId?: string): UseCohortsReturn {
  const { data, loading, error, refetch } = useApiQuery<Cohort[]>({
    queryKey: qk.admin.cohorts(programId),
    queryFn: async () => (await cohortApi.list(programId ? { programId } : undefined))?.data?.cohorts ?? [],
    errorMessage: 'Failed to load cohorts',
  });

  return { cohorts: data ?? EMPTY, loading, error, refetch };
}
