'use client';

import { qk, useApiQuery } from '@/lib/query';
import { meetingsApi } from '@/lib/services/meetings-api';

export interface AvailabilitySlot {
  id: string;
  day: string;
  date?: string | null;
  time: string;
  durationMins: number;
  taken: boolean;
  bookedBy?: { id: string; firstName: string; lastName: string } | null;
  startsAt?: string | null;
  timezone?: string | null;
}

export interface Meeting {
  id: string;
  kind: string;
  day: string;
  time: string;
  durationMins: number;
  agenda: string | null;
  status: 'scheduled' | 'done' | 'cancelled';
  mentor?: { id: string; firstName: string; lastName: string };
  mentee?: { id: string; firstName: string; lastName: string };
  startsAt?: string | null;
  timezone?: string | null;
}

export interface UseMentorScheduleReturn {
  availability: AvailabilitySlot[];
  meetings: Meeting[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface Schedule { availability: AvailabilitySlot[]; meetings: Meeting[] }

const EMPTY: Schedule = { availability: [], meetings: [] };

export function useMentorSchedule(): UseMentorScheduleReturn {
  // Two independent queries rather than one combined fetch, so availability and
  // meetings can be invalidated separately after a booking or a slot edit.
  const avail = useApiQuery<AvailabilitySlot[]>({
    queryKey: qk.mentor.availability,
    queryFn: async () => (await meetingsApi.listMyAvailability())?.data?.slots ?? [],
    errorMessage: 'Failed to load your schedule',
  });

  const meets = useApiQuery<Meeting[]>({
    queryKey: qk.mentor.meetings,
    queryFn: async () => (await meetingsApi.listMeetings())?.data?.meetings ?? [],
    errorMessage: 'Failed to load your schedule',
  });

  const refetch = async () => { await Promise.all([avail.refetch(), meets.refetch()]); };

  return {
    availability: avail.data ?? EMPTY.availability,
    meetings: meets.data ?? EMPTY.meetings,
    loading: avail.loading || meets.loading,
    error: avail.error ?? meets.error,
    refetch,
  };
}
