'use client';

import { useCallback } from 'react';
import { performanceApi, type ClanPerformance } from '@/lib/services/performance-api';
import { qk, useApiQuery } from '@/lib/query';

/**
 * The clan's scores, as the server computed them.
 *
 * Deliberately not computed here. Two of the dimensions are relative to the
 * peer group, and a browser holding one page of a cohort cannot work those out.
 * Doing it in the browser is also how three different scores for the same
 * person came to exist across two pages and the mobile app.
 */
export function useClanPerformance(clanId: string | null) {
  const { data, loading, error, refetch } = useApiQuery<ClanPerformance>({
    queryKey: qk.mentor.clanPerformance(clanId ?? ''),
    queryFn: () => performanceApi.clan(clanId!),
    enabled: !!clanId,
    errorMessage: 'Could not load the clan scores',
  });

  const setDisabled = useCallback(async (disabled: string[]) => {
    if (!clanId) return;
    await performanceApi.setClanDisabled(clanId, disabled);
    await refetch();
  }, [clanId, refetch]);

  return { performance: data ?? null, loading, error, refetch, setDisabled };
}
