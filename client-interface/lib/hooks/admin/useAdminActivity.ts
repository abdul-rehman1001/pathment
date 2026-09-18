'use client';

import { useState } from 'react';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { activityApi } from '@/lib/services/activity-api';
import type { AdminActivityOverview, MenteeActivityStat } from '@/lib/types/activity';

export interface UseAdminActivityReturn {
  overview: AdminActivityOverview | null;
  loading: boolean;
  days: number;
  setDays: (d: number) => void;
  search: string;
  setSearch: (s: string) => void;
  filtered: MenteeActivityStat[];
  refetch: () => void;
}

export function useAdminActivity(): UseAdminActivityReturn {
  const [days, setDays] = useState(7);
  const [search, setSearch] = useState('');

  const { data, loading, refetch } = useApiQuery<AdminActivityOverview | null>({
    queryKey: qk.admin.activity(days),
    queryFn: async () => {
      const res = await activityApi.getAdminOverview(days) as unknown as { data: AdminActivityOverview };
      return res?.data ?? null;
    },
    staleTime: STALE.short,
  });

  const overview = data ?? null;

  const filtered = (overview?.menteeStats ?? []).filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      m.user.firstName.toLowerCase().includes(q) ||
      m.user.lastName.toLowerCase().includes(q) ||
      m.user.email.toLowerCase().includes(q)
    );
  });

  return { overview, loading, days, setDays, search, setSearch, filtered, refetch };
}
