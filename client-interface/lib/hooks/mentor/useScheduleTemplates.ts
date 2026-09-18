'use client';

import { scheduleApi, type ScheduleBlock } from '@/lib/services/schedule-api';
import { qk, useApiQuery, STALE } from '@/lib/query';

export interface ScheduleTemplate {
  id: string;
  name: string;
  description: string | null;
  source: 'org' | 'mentor';
  blocks: ScheduleBlock[];
}

export interface UseScheduleTemplatesReturn {
  local: ScheduleTemplate[];
  org: ScheduleTemplate[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface Templates { local: ScheduleTemplate[]; org: ScheduleTemplate[] }

const EMPTY: Templates = { local: [], org: [] };

export function useScheduleTemplates(): UseScheduleTemplatesReturn {
  const { data, loading, error, refetch } = useApiQuery<Templates>({
    queryKey: qk.mentor.scheduleTemplates,
    queryFn: async () => {
      const res = await scheduleApi.listTemplates();
      return { local: res?.data?.local ?? [], org: res?.data?.org ?? [] };
    },
    staleTime: STALE.long,
    errorMessage: 'Failed to load schedule templates',
  });

  return { ...(data ?? EMPTY), loading, error, refetch };
}
