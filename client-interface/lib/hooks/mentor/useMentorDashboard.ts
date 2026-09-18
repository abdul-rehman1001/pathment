/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useMemo } from 'react';
import { matchingApi } from '@/lib/services/enrollment-api';
import { taskApi } from '@/lib/services/task-api';
import { messagingApi } from '@/lib/services/messaging-api';
import { qk, useApiQuery } from '@/lib/query';
import { useAuth } from '@/lib/context/AuthContext';
import type { NotificationItem } from '@/lib/types/messaging';

export interface UseMentorDashboardReturn {
  matches: any[];
  activeMentees: any[];
  programsCount: number;
  loading: boolean;
  taskStats: any;
  statsLoading: boolean;
  pendingReviews: any[];
  reviewsLoading: boolean;
  recentNotifications: NotificationItem[];
  fetchMyMatches: () => Promise<void>;
  refetchAll: () => void;
}

const NO_MATCHES: any[] = [];
const NO_TASKS: any[] = [];
const NO_NOTIFICATIONS: NotificationItem[] = [];

export function useMentorDashboard(): UseMentorDashboardReturn {
  const { user } = useAuth();
  const mentorId = user?.id ?? '';
  const enabled = !!user?.id;

  // Same key as useMentorMentees — the dashboard and the mentees page ask the
  // server the identical question, so they share one cached answer.
  const matchesQuery = useApiQuery<any[]>({
    queryKey: [...qk.mentor.mentees, mentorId],
    queryFn: async () => {
      const response = await matchingApi.getMatches({ mentorId, status: 'active' });
      return response?.data?.matches || response?.matches || [];
    },
    enabled,
    errorMessage: 'Failed to load your mentees',
  });

  const statsQuery = useApiQuery<any>({
    queryKey: qk.mentor.taskStats(mentorId),
    queryFn: async () => (await taskApi.getMentorTaskStats(mentorId))?.data?.stats || null,
    enabled,
  });

  const reviewsQuery = useApiQuery<any[]>({
    queryKey: qk.mentor.pendingReviews(mentorId),
    queryFn: async () => (await taskApi.getMentorTasks(mentorId, { pendingReview: true }))?.data?.tasks || [],
    enabled,
  });

  const notificationsQuery = useApiQuery<NotificationItem[]>({
    queryKey: qk.messaging.recentNotifications(6),
    queryFn: async () => (await messagingApi.listNotifications(6)).notifications,
    enabled,
  });

  const matches = matchesQuery.data ?? NO_MATCHES;

  const refetchAll = useCallback(() => {
    matchesQuery.refetch();
    statsQuery.refetch();
    reviewsQuery.refetch();
    notificationsQuery.refetch();
  }, [matchesQuery, statsQuery, reviewsQuery, notificationsQuery]);

  const activeMentees = useMemo(
    () => matches.filter((m) => m.status === 'active'),
    [matches]
  );

  const programsCount = useMemo(
    () => [...new Set(matches.map((m) => m.enrollment?.program?.id))].filter(Boolean).length,
    [matches]
  );

  return {
    matches,
    activeMentees,
    programsCount,
    loading: matchesQuery.loading,
    taskStats: statsQuery.data ?? null,
    statsLoading: statsQuery.loading,
    pendingReviews: reviewsQuery.data ?? NO_TASKS,
    reviewsLoading: reviewsQuery.loading,
    recentNotifications: notificationsQuery.data ?? NO_NOTIFICATIONS,
    fetchMyMatches: matchesQuery.refetch,
    refetchAll,
  };
}
