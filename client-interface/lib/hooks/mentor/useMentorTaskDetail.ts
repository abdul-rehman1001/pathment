/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useCallback } from 'react';
import { qk, useApiQuery } from '@/lib/query';
import { taskApi } from '@/lib/services/task-api';
import { submissionService } from '@/lib/services/submissionService';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export interface UseMentorTaskDetailReturn {
  task: any | null;
  loading: boolean;
  error: string;
  cancellingTask: boolean;
  cancelReason: string;
  isCancelling: boolean;
  extensionDecision: 'approve' | 'reject' | null;
  newDueDate: string;
  isHandlingExtension: boolean;
  setCancellingTask: (v: boolean) => void;
  setCancelReason: (v: string) => void;
  setExtensionDecision: (v: 'approve' | 'reject' | null) => void;
  setNewDueDate: (v: string) => void;
  handleExtension: (approved: boolean, submissionId: string) => Promise<void>;
  handleCancelTask: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useMentorTaskDetail(taskId: string): UseMentorTaskDetailReturn {
  const [cancellingTask, setCancellingTask] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [extensionDecision, setExtensionDecision] = useState<'approve' | 'reject' | null>(null);
  const [newDueDate, setNewDueDate] = useState('');
  const [isHandlingExtension, setIsHandlingExtension] = useState(false);

  const { data: task, loading, error, refetch: fetchTask } = useApiQuery<any>({
    queryKey: qk.mentor.taskDetail(taskId),
    queryFn: async () => (await taskApi.getTaskById(taskId)).data.task,
    enabled: !!taskId,
    errorMessage: 'Failed to load task',
  });

  const handleExtension = useCallback(
    async (approved: boolean, submissionId: string) => {
      setIsHandlingExtension(true);
      try {
        await submissionService.handleExtension(
          submissionId,
          approved,
          approved && newDueDate ? newDueDate : undefined
        );
        toast.success(
          approved ? 'Extension approved! Due date updated.' : 'Extension request rejected.'
        );
        setExtensionDecision(null);
        setNewDueDate('');
        await fetchTask();
      } catch (err: unknown) {
        toast.error(extractApiErrorMessage(err, 'Failed to handle extension request'));
      } finally {
        setIsHandlingExtension(false);
      }
    },
    [newDueDate, fetchTask]
  );

  const handleCancelTask = useCallback(async () => {
    if (!cancelReason.trim()) {
      toast.error('Please provide a reason for cancellation');
      return;
    }
    setIsCancelling(true);
    try {
      await taskApi.cancelTask(taskId, cancelReason);
      toast.success('Task cancelled successfully');
      setCancellingTask(false);
      setCancelReason('');
      await fetchTask();
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, 'Failed to cancel task'));
    } finally {
      setIsCancelling(false);
    }
  }, [taskId, cancelReason, fetchTask]);

  return {
    task: task ?? null,
    loading,
    error: error ?? '',
    cancellingTask,
    cancelReason,
    isCancelling,
    extensionDecision,
    newDueDate,
    isHandlingExtension,
    setCancellingTask,
    setCancelReason,
    setExtensionDecision,
    setNewDueDate,
    handleExtension,
    handleCancelTask,
    refetch: fetchTask,
  };
}
