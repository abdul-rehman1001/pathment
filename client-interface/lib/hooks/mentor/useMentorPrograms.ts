'use client';

import { clanApi } from '@/lib/services/clan-api';
import { qk, useApiQuery } from '@/lib/query';

export interface MentorClan {
  id: string;
  name: string;
  myRole: 'lead_mentor' | 'co_mentor';
  menteeCount: number;
  mentorCount: number;
}

export interface MentorProgram {
  id: string;
  name: string;
  status: string | null;
  visibility: string | null;
  description: string | null;
  clanCount: number;
  menteeCount: number;
  clans: MentorClan[];
}

export interface UseMentorProgramsReturn {
  programs: MentorProgram[];
  loading: boolean;
  fetchPrograms: () => Promise<void>;
}

const EMPTY: MentorProgram[] = [];

/**
 * Programs the mentor runs, derived from the clans they lead/co-mentor - so a
 * mentor sees a program the moment they're assigned a clan in it, even before
 * any mentees arrive (clan-based assignment, not 1:1 matches).
 */
export function useMentorPrograms(): UseMentorProgramsReturn {
  const { data, loading, refetch } = useApiQuery<MentorProgram[]>({
    queryKey: qk.mentor.programs,
    queryFn: async () => (await clanApi.mentorPrograms())?.data?.programs ?? [],
    errorMessage: 'Failed to load your programs',
  });

  return { programs: data ?? EMPTY, loading, fetchPrograms: refetch };
}
