'use client';

import { qk, useApiQuery } from '@/lib/query';
import { clanApi } from '@/lib/services/clan-api';

export type InsightStatus = 'red' | 'amber' | 'green';

export interface InsightClan {
  id: string;
  name: string;
  program: string;
  status: InsightStatus;
  statusLabel: string;
  memberCount: number;
  avgCompletion: number;
  avgOnTime: number;
  avgRelative: number;
  atRisk: number;
  openBlockers: number;
  extensions: number;
}

export interface InsightDistributionRow {
  id: string;
  name: string;
  absolute: number;
  relative: number;
  gap: number;
}

export interface OrgInsights {
  kpis: {
    activeMentees: number;
    avgCompletion: number;
    avgRelative: number;
    atRisk: number;
    totalExtensions: number;
    totalOpenBlockers: number;
    clansRed: number;
    clans: number;
  };
  fairness: { avgAbsolute: number; avgRelative: number; gap: number };
  clans: InsightClan[];
  distribution: InsightDistributionRow[];
  redClans: string[];
}

export interface UseOrgInsightsReturn {
  insights: OrgInsights | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useOrgInsights(): UseOrgInsightsReturn {
  const { data, loading, error, refetch } = useApiQuery<OrgInsights | null>({
    queryKey: qk.admin.orgInsights,
    queryFn: async () => {
      const res = await clanApi.insights();
      return res?.data ?? res ?? null;
    },
    errorMessage: 'Failed to load insights',
  });

  return { insights: data ?? null, loading, error, refetch };
}
