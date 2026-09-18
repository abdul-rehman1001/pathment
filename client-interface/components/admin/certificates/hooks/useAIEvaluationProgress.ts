'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { certificatesApi } from '@/lib/services/certificates-api';
import { getSocket } from '@/lib/services/socket-client';

export interface UseAIEvaluationProgressOptions {
  templateId?: string | null;
  onSingleProgress?: (result: any) => void;
  onBatchComplete?: (results: any[]) => void;
}

export function useAIEvaluationProgress(options: UseAIEvaluationProgressOptions = {}) {
  const { templateId, onSingleProgress, onBatchComplete } = options;

  const [aiResults, setAiResults] = useState<any[]>([]);
  const [aiRanAt, setAiRanAt] = useState<string | null>(null);
  const [runningAI, setRunningAI] = useState(false);
  const [aiProgressCount, setAiProgressCount] = useState(0);
  const [aiTotalCount, setAiTotalCount] = useState(0);
  const [aiEvaluationRunId, setAiEvaluationRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!aiEvaluationRunId || !templateId) return;

    const socket = getSocket();
    let pollInterval: NodeJS.Timeout | null = null;

    const handleProgress = (data: { runId: string; menteeId: string; result: any; completed: number; total: number }) => {
      if (data.runId !== aiEvaluationRunId) return;
      setAiProgressCount(data.completed);
      setAiTotalCount(data.total);

      setAiResults(prev => {
        const index = prev.findIndex(r => r.mentee_id === data.result.mentee_id);
        if (index > -1) {
          const updated = [...prev];
          updated[index] = data.result;
          return updated;
        } else {
          return [...prev, data.result];
        }
      });

      if (onSingleProgress) {
        onSingleProgress(data.result);
      }
    };

    const handleComplete = (data: { runId: string; results: any[]; ranAt: string }) => {
      if (data.runId !== aiEvaluationRunId) return;
      setAiResults(data.results || []);
      setAiRanAt(data.ranAt);
      setRunningAI(false);
      setAiEvaluationRunId(null);

      if (onBatchComplete) {
        onBatchComplete(data.results || []);
      }

      toast.success(`AI evaluation completed successfully for ${(data.results || []).length} mentees!`);
    };

    if (socket) {
      socket.on('ai-eval:progress', handleProgress);
      socket.on('ai-eval:complete', handleComplete);
    }

    pollInterval = setInterval(async () => {
      try {
        const res: any = await certificatesApi.getAIEvaluationStatus(templateId, aiEvaluationRunId);
        if (res.success) {
          const payload = res.data?.data ? res.data : res;
          const completed = payload.completed ?? res.completed ?? 0;
          const total = payload.total ?? res.total ?? 0;
          const isDone = payload.isDone ?? res.isDone ?? false;
          const resultsList = payload.data ?? res.data ?? [];

          setAiProgressCount(completed);
          setAiTotalCount(total);

          if (Array.isArray(resultsList) && resultsList.length > 0) {
            setAiResults(resultsList);
            if (onBatchComplete) {
              onBatchComplete(resultsList);
            }
          }

          if (isDone) {
            setAiRanAt(payload.ranAt || res.ranAt || new Date().toISOString());
            setRunningAI(false);
            setAiEvaluationRunId(null);
            if (pollInterval) clearInterval(pollInterval);
            toast.success(`AI evaluation completed successfully!`);
          }
        }
      } catch (err) {
        console.error('AI status poll error:', err);
      }
    }, 4000);

    return () => {
      if (socket) {
        socket.off('ai-eval:progress', handleProgress);
        socket.off('ai-eval:complete', handleComplete);
      }
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [aiEvaluationRunId, templateId, onSingleProgress, onBatchComplete]);

  const runAIEvaluation = useCallback(async (targetTemplateId?: string) => {
    const idToUse = targetTemplateId || templateId;
    if (!idToUse) return;

    try {
      setRunningAI(true);
      setAiProgressCount(0);
      setAiTotalCount(0);
      setAiResults([]);

      const res: any = await certificatesApi.runAIEvaluation(idToUse);
      const runId = res.runId || res.data?.runId;
      const total = res.total ?? res.data?.total ?? 0;

      if (res.success && runId) {
        setAiEvaluationRunId(runId);
        setAiTotalCount(total);
        toast.info(`AI evaluation started for ${total} mentees...`);
      }
    } catch (err: any) {
      toast.error(err.message || 'AI evaluation failed. Check AI connection in Settings.');
      setRunningAI(false);
    }
  }, [templateId]);

  useEffect(() => {
    if (!templateId) return;

    let isMounted = true;
    async function checkInitialStatus() {
      try {
        const statusRes: any = await certificatesApi.getAIEvaluationStatus(templateId!);
        if (statusRes.success && isMounted) {
          const payload = statusRes.data?.data ? statusRes.data : statusRes;
          const activeRunId = payload.runId || statusRes.runId;
          const isDone = payload.isDone ?? statusRes.isDone ?? true;
          const completed = payload.completed ?? statusRes.completed ?? 0;
          const total = payload.total ?? statusRes.total ?? 0;

          if (!isDone && activeRunId) {
            setAiEvaluationRunId(activeRunId);
            setRunningAI(true);
            setAiProgressCount(completed);
            setAiTotalCount(total);
          }
        }
      } catch (e) {
      }
    }

    checkInitialStatus();
    return () => { isMounted = false; };
  }, [templateId]);

  const aiEvalMap = useMemo(() => {
    const map: Record<string, any> = {};
    (aiResults || []).forEach(r => {
      if (r.mentee_id) map[r.mentee_id] = r;
    });
    return map;
  }, [aiResults]);

  return {
    aiResults,
    setAiResults,
    aiRanAt,
    setAiRanAt,
    runningAI,
    setRunningAI,
    aiProgressCount,
    setAiProgressCount,
    aiTotalCount,
    setAiTotalCount,
    aiEvaluationRunId,
    setAiEvaluationRunId,
    aiEvalMap,
    runAIEvaluation,
  };
}
