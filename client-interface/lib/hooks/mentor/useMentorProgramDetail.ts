/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { clanApi } from '@/lib/services/clan-api';
import { qk, useApiQuery } from '@/lib/query';

export interface ProgramPerson {
  id: string;
  name: string;
  email?: string;
  role: string;
  avatar: string;
}

export interface ProgramClanDetail {
  id: string;
  name: string;
  myRole: 'lead_mentor' | 'co_mentor';
  mentees: ProgramPerson[];
  coMentors: ProgramPerson[];
}

export interface MentorProgramInfo {
  id: string;
  name: string;
  status: string | null;
  visibility: string | null;
  description: string | null;
}

export interface UseMentorProgramDetailReturn {
  program: MentorProgramInfo | null;
  clans: ProgramClanDetail[];
  menteeCount: number;
  coMentorCount: number;
  loading: boolean;
  notFound: boolean;
  refetch: () => Promise<void>;
}

const fullName = (u: any) => `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || u?.email || 'Member';
const initials = (u: any) => `${(u?.firstName || '')[0] || ''}${(u?.lastName || '')[0] || ''}`.toUpperCase() || '?';

interface ProgramDetail {
  program: MentorProgramInfo | null;
  clans: ProgramClanDetail[];
}

const EMPTY: ProgramDetail = { program: null, clans: [] };

const toPerson = (u: any): ProgramPerson => ({
  id: u.id,
  name: fullName(u),
  email: u.email,
  role: u.role,
  avatar: initials(u),
});

/**
 * Mentor program detail, built only from what the mentor can actually access:
 * the clans they lead/co-mentor in the program, with each clan's roster.
 *
 * One request. This used to fetch the program list and then GET /clans/:id once
 * per clan, so a twenty-clan program fired twenty-one requests in a burst.
 */
export function useMentorProgramDetail(programId: string): UseMentorProgramDetailReturn {
  const { data, loading, errorStatus, error, refetch } = useApiQuery<ProgramDetail>({
    queryKey: qk.mentor.programDetail(programId),
    queryFn: async () => {
      const res: any = await clanApi.mentorProgramDetail(programId);
      const payload = res?.data ?? {};
      return {
        program: payload.program ?? null,
        clans: (payload.clans ?? []).map((c: any): ProgramClanDetail => ({
          id: c.id,
          name: c.name,
          myRole: c.myRole,
          mentees: (c.mentees ?? []).map(toPerson),
          coMentors: (c.coMentors ?? []).map(toPerson),
        })),
      };
    },
    enabled: !!programId,
  });

  const { program, clans } = data ?? EMPTY;
  const menteeCount = clans.reduce((n, c) => n + c.mentees.length, 0);
  const coMentorCount = clans.reduce((n, c) => n + c.coMentors.length, 0);

  return {
    program,
    clans,
    menteeCount,
    coMentorCount,
    loading,
    notFound: errorStatus === 404 || (!!error && !loading),
    refetch,
  };
}
