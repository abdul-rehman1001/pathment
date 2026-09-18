'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

export interface ApiQueryOptions<T> {
  queryKey: QueryKey;
  queryFn: () => Promise<T>;
  /** Skip the request until its inputs exist (e.g. an id that is still loading). */
  enabled?: boolean;
  staleTime?: number;
  /**
   * Background poll. Use only where data is genuinely live. Pass a function to
   * decide from the latest data — e.g. poll only while something is processing.
   */
  refetchInterval?: number | false | ((data: T | undefined) => number | false);
  refetchOnWindowFocus?: boolean;
  /** Shown instead of the raw server message when the request fails. */
  errorMessage?: string;
}

export interface ApiQueryResult<T> {
  data: T | undefined;
  /** First load, with nothing to show yet. */
  loading: boolean;
  /** Any fetch in flight, including background refreshes over existing data. */
  fetching: boolean;
  error: string | null;
  /** HTTP status of the failure, for branching (403 vs 404). Null when no error. */
  errorStatus: number | null;
  refetch: () => Promise<void>;
}

/**
 * useQuery mapped onto this codebase's hook contract — `{ loading, error, refetch }`
 * with `error` as a display string. Prefer it over calling useQuery directly so
 * hooks stay consistent and callers do not have to learn two shapes.
 *
 * Reach for useQuery itself when you need something this deliberately hides
 * (select, placeholderData, infinite queries).
 */
export function useApiQuery<T>({
  queryKey,
  queryFn,
  enabled = true,
  staleTime,
  refetchInterval,
  refetchOnWindowFocus,
  errorMessage,
}: ApiQueryOptions<T>): ApiQueryResult<T> {
  const query = useQuery({
    queryKey,
    queryFn,
    enabled,
    staleTime,
    refetchInterval: typeof refetchInterval === 'function'
      ? (q) => refetchInterval(q.state.data as T | undefined)
      : refetchInterval,
    refetchOnWindowFocus,
  });

  // Depend on `query.refetch` (which TanStack keeps referentially stable), NOT
  // on `query` — that is a fresh object every render, so a `[refetch]` dependency
  // upstream would re-fire forever. That loop is what left the notification
  // drawer stuck on "Loading notifications...".
  const queryRefetch = query.refetch;
  const refetch = useCallback(async () => {
    await queryRefetch();
  }, [queryRefetch]);

  return {
    data: query.data,
    loading: query.isPending && enabled,
    fetching: query.isFetching,
    error: query.error ? extractApiErrorMessage(query.error, errorMessage) : null,
    errorStatus: (query.error as { response?: { status?: number } } | null)?.response?.status ?? null,
    refetch,
  };
}

/**
 * Invalidate cached queries by key prefix after a mutation.
 * `invalidate(qk.mentor.cohort)` refetches the cohort wherever it is mounted.
 */
export function useInvalidate() {
  const client = useQueryClient();
  return useCallback(
    (...keys: QueryKey[]) => Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey }))),
    [client]
  );
}
