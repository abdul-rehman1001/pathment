'use client';

import { useCallback } from 'react';
import { mentorApi } from '@/lib/services/mentor-api';
import { qk, useApiQuery, useInvalidate, STALE } from '@/lib/query';

export interface FeedbackSnippet {
  id: string;
  label: string;
  body: string;
}

export interface UseFeedbackSnippetsReturn {
  snippets: FeedbackSnippet[];
  loading: boolean;
  create: (payload: { label: string; body: string }) => Promise<FeedbackSnippet | null>;
  remove: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const EMPTY: FeedbackSnippet[] = [];

/**
 * The mentor's saved feedback snippets — reusable bits of review feedback shown
 * in both review drawers. CRUD against /mentor/feedback-snippets.
 */
export function useFeedbackSnippets(): UseFeedbackSnippetsReturn {
  const invalidate = useInvalidate();

  const { data, loading, refetch } = useApiQuery<FeedbackSnippet[]>({
    queryKey: qk.mentor.feedbackSnippets,
    queryFn: async () => (await mentorApi.listFeedbackSnippets()) ?? [],
    staleTime: STALE.long,
  });

  const create = useCallback(async (payload: { label: string; body: string }) => {
    const snippet = await mentorApi.createFeedbackSnippet(payload);
    await invalidate(qk.mentor.feedbackSnippets);
    return snippet;
  }, [invalidate]);

  const remove = useCallback(async (id: string) => {
    await mentorApi.removeFeedbackSnippet(id);
    await invalidate(qk.mentor.feedbackSnippets);
  }, [invalidate]);

  return { snippets: data ?? EMPTY, loading, create, remove, refetch };
}
