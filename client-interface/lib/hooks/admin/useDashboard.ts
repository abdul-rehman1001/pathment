'use client';

import { qk, useApiQuery, STALE } from '@/lib/query';
import { adminApi } from '@/lib/services/admin-api';

interface DashboardStats {
  totalPrograms: number;
  activeMentees: number;
  activeMentors: number;
  completionRate: number;
}

interface RecentProgram {
  id: string;
  name: string;
  status: string;
  enrollments: number;
  completion: number;
  startDate: string;
  mentors?: number;
}

interface PendingMatch {
  id: string;
  mentee: { id: string; name: string; email: string };
  program: string;
  enrolledAt: string;
  waitTime: string;
}

interface DashboardData {
  stats?: DashboardStats;
  recentPrograms?: RecentProgram[];
  pendingMatches?: PendingMatch[];
}

interface UseDashboardReturn {
  dashboardData: DashboardData | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useDashboard(): UseDashboardReturn {
  const { data, loading, refetch } = useApiQuery<DashboardData>({
    queryKey: qk.admin.dashboard,
    queryFn: async () => (await adminApi.dashboard.getStats()) as DashboardData,
    staleTime: STALE.short,
    errorMessage: 'Failed to load dashboard data',
  });

  return { dashboardData: data ?? null, loading, refetch };
}
