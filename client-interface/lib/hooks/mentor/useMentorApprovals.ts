import { useCallback, useEffect, useMemo } from 'react';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { useClan, ALL_CLANS } from '@/lib/context/ClanContext';
import { mentorApi } from '@/lib/services/mentor-api';
import { notifyApprovalsChanged } from '@/lib/utils/approvals-badge';
import { submissionService } from '@/lib/services/submissionService';
import type { SubmissionFile } from '@/lib/types/submission';

export interface BulkReviewPayload {
  decision: 'approved' | 'approved_notes' | 'changes' | 'rejected';
  rating?: number;
  feedbackText?: string;
  revisionNotes?: string;
  /** Absolute points (used when all selected tasks share one max). */
  pointsAwarded?: number;
  /** Percent of each task's own max (used when the selection has mixed maxima). */
  pointsPercent?: number;
}

/** The clan a queue row belongs to — drives the sidebar clan-scope filter. */
export interface ItemClan { id: string; name: string | null }

export interface ApprovalItem {
  submissionId: string;
  taskId: string;
  clan: ItemClan | null;
  roadmapTaskId: string | null;
  version: number;
  submissionText: string;
  submissionUrls: string[];
  files: SubmissionFile[];
  submittedAt: string;
  isLate: boolean;
  title: string;
  type: string | null;
  brief: string | null;
  deliverable: string | null;
  criteria: string[];
  maxPoints: number;
  mentee: { id: string; name: string; avatar: string; profilePictureUrl: string | null } | null;
  isExtensionRequest: boolean;
  extensionReason: string | null;
  extensionDays: number | null;
  dueDate: string | null;
  menteeTimezone: string | null;
}

/** A task the mentor sent back for changes, awaiting the mentee's resubmission. */
export interface ChangesRequestedItem {
  taskId: string;
  clan: ItemClan | null;
  roadmapTaskId: string | null;
  title: string;
  type: string | null;
  revisionCount: number;
  /** 'changes' = changes requested, 'rejected' = rejected. Both await resubmission. */
  decision: 'changes' | 'rejected';
  revisionNotes: string | null;
  feedbackText: string | null;
  requestedAt: string;
  dueDate: string | null;
  isLate: boolean;
  mentee: { id: string; name: string; avatar: string; profilePictureUrl: string | null } | null;
}

/** A task the mentor has already approved — the "Reviewed" history. */
export interface ReviewedItem {
  taskId: string;
  clan: ItemClan | null;
  roadmapTaskId: string | null;
  title: string;
  type: string | null;
  /** 'approved' or 'approved_notes'. */
  decision: 'approved' | 'approved_notes';
  rating: number | null;
  pointsAwarded: number;
  maxPoints: number;
  feedbackText: string | null;
  reviewedAt: string;
  isLate: boolean;
  mentee: { id: string; name: string; avatar: string; profilePictureUrl?: string | null } | null;
}

export interface UseMentorApprovalsReturn {
  queue: ApprovalItem[];
  changesRequested: ChangesRequestedItem[];
  reviewed: ReviewedItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  bulkApprove: (submissionIds: string[]) => Promise<void>;
  bulkReview: (submissionIds: string[], payload: BulkReviewPayload) => Promise<void>;
  handleExtension: (submissionId: string, approved: boolean, newDueDate?: string) => Promise<void>;
}

interface ApprovalsData {
  queue: ApprovalItem[];
  changesRequested: ChangesRequestedItem[];
  reviewed: ReviewedItem[];
}

const EMPTY: ApprovalsData = { queue: [], changesRequested: [], reviewed: [] };

export function useMentorApprovals(): UseMentorApprovalsReturn {
  const { activeClanId } = useClan();

  const { data, loading, error, refetch } = useApiQuery<ApprovalsData>({
    queryKey: qk.mentor.approvals,
    queryFn: async () => {
      // The changes-requested and reviewed lists are best-effort: a failure
      // there must not blank the whole page.
      const [res, changesRes, reviewedRes] = await Promise.all([
        mentorApi.getApprovals(),
        mentorApi.getChangesRequested().catch(() => null),
        mentorApi.getReviewed().catch(() => null),
      ]);
      return {
        queue: res?.data?.queue ?? [],
        changesRequested: changesRes?.data?.items ?? [],
        reviewed: reviewedRes?.data?.items ?? [],
      };
    },
    staleTime: STALE.short,
    errorMessage: 'Failed to load the approvals queue',
  });

  const { queue: allQueue, changesRequested: allChangesRequested, reviewed: allReviewed } = data ?? EMPTY;

  // The queue just changed — nudge the sidebar badge so it never lags behind
  // what is on screen.
  useEffect(() => {
    if (data) notifyApprovalsChanged();
  }, [data]);

  // Scope every list to the clan picked in the sidebar (multi-clan mentors).
  // 'all' = the merged view. Fetch-once/filter-in-memory, like the cohort views,
  // so switching clans is instant and needs no refetch.
  const scope = useCallback(
    <T extends { clan: ItemClan | null }>(rows: T[]) =>
      (activeClanId === ALL_CLANS ? rows : rows.filter((r) => r.clan?.id === activeClanId)),
    [activeClanId]
  );
  const queue = useMemo(() => scope(allQueue), [allQueue, scope]);
  const changesRequested = useMemo(() => scope(allChangesRequested), [allChangesRequested, scope]);
  const reviewed = useMemo(() => scope(allReviewed), [allReviewed, scope]);

  const bulkApprove = useCallback(async (submissionIds: string[]) => {
    await mentorApi.bulkApprove(submissionIds);
    await refetch();
  }, [refetch]);

  const bulkReview = useCallback(async (submissionIds: string[], payload: BulkReviewPayload) => {
    await mentorApi.bulkReview(submissionIds, payload);
    await refetch();
  }, [refetch]);

  const handleExtension = useCallback(async (submissionId: string, approved: boolean, newDueDate?: string) => {
    await submissionService.handleExtension(submissionId, approved, newDueDate);
    await refetch();
  }, [refetch]);

  return { queue, changesRequested, reviewed, loading, error, refetch, bulkApprove, bulkReview, handleExtension };
}
