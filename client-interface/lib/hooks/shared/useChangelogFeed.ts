'use client';

import { useCallback } from 'react';
import { changelogApi, type ChangelogFeed } from '@/lib/services/changelog-api';
import { qk, useApiQuery, useInvalidate, STALE } from '@/lib/query';

const EMPTY: ChangelogFeed = { updates: [], unreadCount: 0, majorUnseen: [] };

/**
 * The "what's new" feed. ChangelogMount (the modal) and ChangelogDrawer (the
 * badge) are both mounted in every portal layout and both need it, so they share
 * one cached query instead of fetching the same endpoint twice per page load.
 */
export function useChangelogFeed(role: string) {
  const invalidate = useInvalidate();

  const { data, loading, refetch } = useApiQuery<ChangelogFeed>({
    queryKey: qk.changelog.feed(role),
    queryFn: () => changelogApi.feed(role),
    enabled: !!role,
    staleTime: STALE.long,
  });

  const markSeen = useCallback(async () => {
    await changelogApi.markSeen().catch(() => {});
    await invalidate(qk.changelog.feed(role));
  }, [invalidate, role]);

  return { feed: data ?? EMPTY, loading, refetch, markSeen };
}
