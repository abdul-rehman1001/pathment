'use client';

import { qk, useApiQuery } from '@/lib/query';
import { clanApi } from '@/lib/services/clan-api';

export type ClanStatus = 'red' | 'amber' | 'green';

export interface ClanHealthLead {
  id: string;
  name: string | null;
  avatar: string;
}

export interface ClanHealthCard {
  id: string;
  name: string;
  status: ClanStatus;
  statusLabel: string;
  statusReason: string;
  memberCount: number;
  mentorCount: number;
  avgCompletion: number;
  avgOnTime: number;
  atRisk: number;
  openBlockers: number;
  pendingApprovals: number;
  leadMentor: ClanHealthLead | null;
}

export interface ProgramHealth {
  id: string;
  name: string;
  status: string | null;
  clanCount: number;
  memberCount: number;
  atRisk: number;
  avgCompletion: number;
  clans: ClanHealthCard[];
}

export interface AtRiskMentee {
  id: string;
  name: string;
  avatar: string;
  avatarUrl?: string | null;
  program: string;
  risk: 'high' | 'watch' | 'low';
  riskReason: string;
  absoluteProgress: number;
  onTimeRate: number;
}

export interface ClanHealthKpis {
  activeMentees: number;
  avgCompletion: number;
  avgOnTime: number;
  atRisk: number;
  clans: number;
  programs: number;
}

export interface UseClanHealthReturn {
  kpis: ClanHealthKpis | null;
  programs: ProgramHealth[];
  atRiskMentees: AtRiskMentee[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface HealthData {
  kpis: ClanHealthKpis | null;
  programs: ProgramHealth[];
  atRiskMentees: AtRiskMentee[];
}

const EMPTY: HealthData = { kpis: null, programs: [], atRiskMentees: [] };

export function useClanHealth(): UseClanHealthReturn {
  const { data, loading, error, refetch } = useApiQuery<HealthData>({
    queryKey: qk.admin.clanHealth,
    queryFn: async () => {
      const res = await clanApi.health();
      const d = res?.data ?? {};
      return { kpis: d.kpis ?? null, programs: d.programs ?? [], atRiskMentees: d.atRiskMentees ?? [] };
    },
    errorMessage: 'Failed to load clan health',
  });

  return { ...(data ?? EMPTY), loading, error, refetch };
}
