'use client';

import { rewardsApi } from '@/lib/services/rewards-api';
import { qk, useApiQuery } from '@/lib/query';

export interface Gift {
  id: string;
  name: string;
  description: string | null;
  costXp: number;
  imageUrl: string | null;
  stock: number | null;
}
export interface Redemption {
  id: string;
  gift: string;
  mentee: string | null;
  costXp: number;
  at: string;
}

export interface UseRewardsReturn {
  gifts: Gift[];
  redemptions: Redemption[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface RewardsOverview { gifts: Gift[]; redemptions: Redemption[] }

const EMPTY: RewardsOverview = { gifts: [], redemptions: [] };

export function useRewards(): UseRewardsReturn {
  const { data, loading, error, refetch } = useApiQuery<RewardsOverview>({
    queryKey: qk.mentor.rewards,
    queryFn: async () => {
      const res = await rewardsApi.overview();
      return { gifts: res?.data?.gifts ?? [], redemptions: res?.data?.redemptions ?? [] };
    },
    errorMessage: 'Failed to load rewards',
  });

  return { ...(data ?? EMPTY), loading, error, refetch };
}
