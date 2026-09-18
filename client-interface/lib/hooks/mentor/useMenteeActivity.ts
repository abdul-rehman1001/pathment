'use client';

import { useState } from 'react';
import { activityApi } from '@/lib/services/activity-api';
import { qk, useApiQuery, STALE } from '@/lib/query';
import type { ActivitySummary, DailySession, RecentEvent } from '@/lib/types/activity';

interface ActivityPayload {
  summary: ActivitySummary | null;
  dailySessions: DailySession[];
  recentEvents: RecentEvent[];
}

export interface UseMenteeActivityReturn extends ActivityPayload {
  loading: boolean;
  days: number;
  setDays: (d: number) => void;
  refetch: () => void;
}

const EMPTY: ActivityPayload = { summary: null, dailySessions: [], recentEvents: [] };

export function useMenteeActivity(menteeId: string | null): UseMenteeActivityReturn {
  const [days, setDays] = useState(7);

  const { data, loading, refetch } = useApiQuery<ActivityPayload>({
    queryKey: qk.mentee.activity(menteeId ?? '', days),
    queryFn: async () => {
      const res = await activityApi.getMenteeSummary(menteeId!, days) as unknown as { data: ActivityPayload };
      const payload = res?.data;
      return {
        summary: payload?.summary ?? null,
        dailySessions: payload?.dailySessions ?? [],
        recentEvents: payload?.recentEvents ?? [],
      };
    },
    enabled: !!menteeId,
    staleTime: STALE.short,
    refetchInterval: 5 * 60_000,
  });

  return { ...(data ?? EMPTY), loading, days, setDays, refetch };
}
