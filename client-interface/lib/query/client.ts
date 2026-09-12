import { QueryClient } from '@tanstack/react-query';
import { getRateLimit } from '@/lib/utils/api-error';

/** How long fetched data is considered fresh. Tune per query via `staleTime`. */
export const STALE = {
  /** Changes constantly — counts, queues, dashboards. */
  short: 30_000,
  /** The default: lists and detail pages. */
  medium: 60_000,
  /** Rarely changes within a session — permissions, catalogues, templates. */
  long: 5 * 60_000,
} as const;

const statusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } })?.response?.status;

/**
 * Never retry a request the server answered deliberately. A 401/403/404 will not
 * change by asking again, and retrying a 429 is actively harmful — it spends the
 * very budget that rejected us. Only network faults and 5xx are worth another go.
 */
const retry = (failureCount: number, error: unknown): boolean => {
  const status = statusOf(error);
  if (status !== undefined && status < 500 && status !== 408) return false;
  return failureCount < 2;
};

const retryDelay = (attempt: number, error: unknown): number => {
  const { limited, retryAfterSec } = getRateLimit(error);
  if (limited) return retryAfterSec * 1000;
  return Math.min(1000 * 2 ** attempt, 30_000);
};

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE.medium,
        gcTime: 5 * 60_000,
        retry,
        retryDelay,
        // Refetching on focus is safe *because* of staleTime: a query only
        // refires if its data is older than that. With the library default of
        // staleTime 0 it would refetch on every focus and every mount, which is
        // the trap this config exists to avoid.
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchOnMount: true,
      },
      mutations: { retry: false },
    },
  });
}
