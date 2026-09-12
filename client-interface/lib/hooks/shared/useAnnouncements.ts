'use client';

import { announcementsApi } from '@/lib/services/announcements-api';
import { qk, useApiQuery } from '@/lib/query';

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: string;
  audienceId: string | null;
  audienceLabel: string;
  pinned: boolean;
  at: string;
  author: { name: string; role: string } | null;
  /** True when the current viewer authored it (can pin/delete). */
  mine: boolean;
  reactions: { acknowledged: number; helpful: number };
  myReactions: string[];
}

export interface UseAnnouncementsReturn {
  announcements: Announcement[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const EMPTY: Announcement[] = [];

/** Announcements scoped to the current viewer (server filters by audience). */
export function useAnnouncements(): UseAnnouncementsReturn {
  const { data, loading, error, refetch } = useApiQuery<Announcement[]>({
    queryKey: qk.announcements,
    queryFn: async () => (await announcementsApi.list())?.data?.announcements ?? [],
    errorMessage: 'Failed to load announcements',
  });

  return { announcements: data ?? EMPTY, loading, error, refetch };
}
