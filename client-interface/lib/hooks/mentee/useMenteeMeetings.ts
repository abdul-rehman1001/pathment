'use client';

import { qk, useApiQuery } from '@/lib/query';
import { meetingsApi } from '@/lib/services/meetings-api';

export interface OpenSlot {
  id: string;
  day: string;
  time: string;
  durationMins: number;
  /** True UTC instant (preferred for display); legacy slots may lack it. */
  startsAt?: string | null;
  timezone?: string | null;
}

export interface BookableMentor {
  mentor: { id: string; name: string };
  slots: OpenSlot[];
}

export interface MenteeMeeting {
  id: string;
  kind: string;
  day: string;
  time: string;
  durationMins: number;
  startsAt?: string | null;
  timezone?: string | null;
  agenda: string | null;
  status: 'scheduled' | 'done' | 'cancelled';
  mentor?: { id: string; firstName: string; lastName: string };
  cancellationReason?: string | null;
  cancelledBy?: string | null;
}

export interface UseMenteeMeetingsReturn {
  bookable: BookableMentor[];
  meetings: MenteeMeeting[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const NO_MENTORS: BookableMentor[] = [];
const NO_MEETINGS: MenteeMeeting[] = [];

export function useMenteeMeetings(): UseMenteeMeetingsReturn {
  const bookableQuery = useApiQuery<BookableMentor[]>({
    queryKey: qk.me.bookable,
    queryFn: async () => (await meetingsApi.getBookable())?.data?.mentors ?? [],
    errorMessage: 'Failed to load your meetings',
  });

  const meetingsQuery = useApiQuery<MenteeMeeting[]>({
    queryKey: qk.me.meetings,
    queryFn: async () => (await meetingsApi.listMeetings())?.data?.meetings ?? [],
    errorMessage: 'Failed to load your meetings',
  });

  const refetch = async () => { await Promise.all([bookableQuery.refetch(), meetingsQuery.refetch()]); };

  return {
    bookable: bookableQuery.data ?? NO_MENTORS,
    meetings: meetingsQuery.data ?? NO_MEETINGS,
    loading: bookableQuery.loading || meetingsQuery.loading,
    error: bookableQuery.error ?? meetingsQuery.error,
    refetch,
  };
}
