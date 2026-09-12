/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { taskApi } from '@/lib/services/task-api';
import { qk, useApiQuery } from '@/lib/query';

export interface UseTaskDetailReturn {
  task: any;
  loading: boolean;
  error: string;
  /** HTTP status when the load failed — lets the page tell 403 from 404. */
  errorStatus: number | null;
  refetch: () => Promise<void>;
}

export function useTaskDetail(taskId: string): UseTaskDetailReturn {
  const { data, loading, error, errorStatus, refetch } = useApiQuery<any>({
    queryKey: qk.me.task(taskId),
    queryFn: async () => (await taskApi.getTaskById(taskId)).data.task,
    enabled: !!taskId,
    errorMessage: 'Failed to load task',
  });

  return { task: data ?? null, loading, error: error ?? '', errorStatus, refetch };
}
