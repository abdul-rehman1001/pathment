'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { communityApi } from '@/lib/services/community-api';

export type ReportStatus = 'open' | 'reviewed' | 'dismissed';

export interface CommunityReportRow {
  id: string;
  targetType: 'post' | 'comment';
  targetId: string;
  reason: string | null;
  status: ReportStatus;
  at: string;
  reporter: { id: string; name: string };
  preview: string;
  targetAuthor: string | null;
  targetDeleted: boolean;
}

const EMPTY: CommunityReportRow[] = [];

export function useModeration() {
  const [status, setStatus] = useState<ReportStatus>('open');

  const { data, loading, refetch } = useApiQuery<CommunityReportRow[]>({
    queryKey: qk.admin.moderation(status),
    queryFn: async () => {
      const r: any = await communityApi.reports(status); // eslint-disable-line @typescript-eslint/no-explicit-any
      return r?.data?.reports ?? [];
    },
    staleTime: STALE.short,
    errorMessage: 'Failed to load reports',
  });

  const resolve = useCallback(async (id: string, s: 'reviewed' | 'dismissed') => {
    try {
      await communityApi.resolveReport(id, s);
      toast.success(s === 'dismissed' ? 'Dismissed' : 'Marked reviewed');
      await refetch();
    } catch { toast.error('Could not update report'); }
  }, [refetch]);

  const removeContent = useCallback(async (row: CommunityReportRow) => {
    try {
      if (row.targetType === 'post') await communityApi.deletePost(row.targetId);
      else await communityApi.deleteComment(row.targetId);
      await communityApi.resolveReport(row.id, 'reviewed');
      toast.success('Content removed');
      await refetch();
    } catch { toast.error('Could not remove content'); }
  }, [refetch]);

  return { reports: data ?? EMPTY, status, setStatus, loading, refetch, resolve, removeContent };
}
