'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mentorSpecApi, type MentorSpec } from '@/lib/services/mentor-spec-api';
import { qk, useApiQuery, STALE } from '@/lib/query';

const EMPTY: MentorSpec = { intro: '', principles: [], responsibilities: [], conduct: [], time: [], faqs: [] };

export function useMentorSpec() {
  const client = useQueryClient();

  const { data, loading, refetch } = useApiQuery<MentorSpec>({
    queryKey: qk.mentor.spec,
    queryFn: async () => (await mentorSpecApi.get())?.data?.spec ?? EMPTY,
    staleTime: STALE.long,
  });

  const save = useCallback(async (next: MentorSpec) => {
    const res = await mentorSpecApi.save(next);
    client.setQueryData(qk.mentor.spec, res?.data?.spec ?? next);
  }, [client]);

  return { spec: data ?? null, loading, refetch, save };
}
