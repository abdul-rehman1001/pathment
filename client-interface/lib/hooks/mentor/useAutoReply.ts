'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { autoReplyApi, type AutoReplyStatus } from '@/lib/services/auto-reply-api';
import { qk, useApiQuery } from '@/lib/query';

/**
 * What auto reply needs before it can be switched on, and whether it is.
 *
 * The status is never derived in the browser. Whether a mentor is ready depends
 * on their API key, how much material they have ingested and how much of their
 * writing has been studied, and none of that is knowable from the page.
 */
export function useAutoReply() {
  const client = useQueryClient();

  const { data, loading, error, refetch } = useApiQuery<AutoReplyStatus>({
    queryKey: qk.mentor.autoReply,
    queryFn: () => autoReplyApi.status(),
    errorMessage: 'Could not load auto reply',
  });

  /** Returns the server's message when it refuses, so the page can show it. */
  const setEnabled = useCallback(async (enabled: boolean) => {
    const next = await autoReplyApi.setEnabled(enabled);
    client.setQueryData(qk.mentor.autoReply, next);
    return next;
  }, [client]);

  return { status: data ?? null, loading, error, refetch, setEnabled };
}
