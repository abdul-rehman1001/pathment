'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { messagingApi } from '@/lib/services/messaging-api';
import { mentorApi } from '@/lib/services/mentor-api';
import { acquireSocket } from '@/lib/services/socket-client';
import { APPROVALS_CHANGED } from '@/lib/utils/approvals-badge';
import { qk, useApiQuery, STALE } from '@/lib/query';

export interface ApprovalCounts { total: number; byClan: Record<string, number> }

const NO_COUNTS: ApprovalCounts = { total: 0, byClan: {} };

/**
 * The sidebar's unread-message and approvals badges.
 *
 * Both are cached and invalidated by events (socket, APPROVALS_CHANGED) rather
 * than refetched on navigation, which is what used to make every route change
 * cost two requests.
 */
export function useNavBadges({ userId, isMentor, portal }: { userId?: string; isMentor: boolean; portal: string }) {
  const client = useQueryClient();

  const { data: unreadMessageCount = 0 } = useApiQuery<number>({
    queryKey: qk.messaging.unreadCount(portal),
    queryFn: async () => {
      const conversations = await messagingApi.listConversations(50);
      return conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    },
    enabled: !!userId,
    staleTime: STALE.short,
  });

  const { data: approvalCounts = NO_COUNTS } = useApiQuery<ApprovalCounts>({
    queryKey: qk.mentor.approvalsCount,
    queryFn: async () => {
      const r = await mentorApi.getApprovalsCount() as { data?: ApprovalCounts };
      return { total: r?.data?.total ?? 0, byClan: r?.data?.byClan ?? {} };
    },
    enabled: !!userId && isMentor,
    staleTime: STALE.short,
  });

  useEffect(() => {
    if (!isMentor) return;
    const onChanged = () => client.invalidateQueries({ queryKey: qk.mentor.approvalsCount });
    window.addEventListener(APPROVALS_CHANGED, onChanged);
    return () => window.removeEventListener(APPROVALS_CHANGED, onChanged);
  }, [isMentor, client]);

  useEffect(() => {
    if (!userId) return;
    const socket = acquireSocket();
    if (!socket) return;

    const onNotification = (data: { type?: string }) => {
      if (data?.type === 'message') client.invalidateQueries({ queryKey: qk.messaging.unreadCount(portal) });
      else if (data?.type === 'task') client.invalidateQueries({ queryKey: qk.mentor.approvalsCount });
    };
    const onUnreadCount = () => client.invalidateQueries({ queryKey: qk.messaging.unreadCount(portal) });

    socket.on('notification:new', onNotification);
    socket.on('message:unread-count', onUnreadCount);
    return () => {
      socket.off('notification:new', onNotification);
      socket.off('message:unread-count', onUnreadCount);
    };
  }, [userId, client, portal]);

  return { unreadMessageCount, approvalCounts };
}
