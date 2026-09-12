'use client';

import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { enrollmentApi, matchingApi, mentorApi } from '@/lib/services/enrollment-api';
import { programManagementApi } from '@/lib/services/program-api';
import { useDebounce } from '@/lib/hooks/shared/useDebounce';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { qk, useApiQuery } from '@/lib/query';
import { useConfirm } from '@/lib/context/ConfirmContext';

const MENTOR_LIMIT = 10;

interface MentorAssignmentProgram {
  id: string;
  name: string;
}

interface MentorAssignmentEnrollment {
  id: string;
  [key: string]: unknown;
}

interface MentorAssignmentMentor {
  id: string;
  [key: string]: unknown;
}

interface MentorAssignmentSuggestion {
  id: string;
  [key: string]: unknown;
}

export interface UseMentorAssignmentReturn {
  // programs
  programs: any[];
  selectedProgram: string;
  setSelectedProgram: (id: string) => void;

  // enrollments / pending matches
  enrollments: any[];
  suggestions: Record<string, any[]>;
  loading: boolean;

  // available mentors panel
  allMentors: any[];
  mentorsLoading: boolean;
  mentorSearch: string;
  setMentorSearch: (v: string) => void;
  mentorPage: number;
  setMentorPage: (p: number | ((prev: number) => number)) => void;
  mentorTotalPages: number;
  mentorTotal: number;

  // actions
  matching: string | null;
  autoMatching: boolean;
  handleCreateMatch: (enrollmentId: string, mentorId: string) => Promise<void>;
  handleAutoMatch: () => Promise<void>;
  refetchEnrollments: () => Promise<void>;
}

interface MentorPage {
  mentors: MentorAssignmentMentor[];
  totalPages: number;
  total: number;
}

const NO_PROGRAMS: MentorAssignmentProgram[] = [];
const NO_ENROLLMENTS: MentorAssignmentEnrollment[] = [];
const NO_MENTOR_PAGE: MentorPage = { mentors: [], totalPages: 1, total: 0 };
const NO_SUGGESTIONS: Record<string, MentorAssignmentSuggestion[]> = {};

export function useMentorAssignment(): UseMentorAssignmentReturn {
  const confirm = useConfirm();
  const [programOverride, setSelectedProgram] = useState('');
  const [mentorSearch, setMentorSearch] = useState('');
  const [mentorPage, setMentorPage] = useState(1);
  const [matching, setMatching] = useState<string | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);
  const debouncedMentorSearch = useDebounce(mentorSearch, 400);

  const programsQuery = useApiQuery<MentorAssignmentProgram[]>({
    queryKey: qk.admin.programs,
    queryFn: async () => {
      const response = await programManagementApi.programs.getAll();
      return Array.isArray(response?.data) ? response.data : [];
    },
    errorMessage: 'Failed to load programs',
  });

  const programs = programsQuery.data ?? NO_PROGRAMS;
  // Default to the first program; an explicit pick wins. Derived, so there is no
  // effect to fall out of step with the list.
  const selectedProgram = programOverride || programs[0]?.id || '';

  const enrollmentsQuery = useApiQuery<MentorAssignmentEnrollment[]>({
    queryKey: qk.admin.pendingMatches(selectedProgram),
    queryFn: async () => {
      const response = await enrollmentApi.getAll({ programId: selectedProgram, status: 'pending_match' });
      return response?.data?.enrollments || response?.enrollments || [];
    },
    enabled: !!selectedProgram,
    errorMessage: 'Failed to load enrollments',
  });

  const enrollments = enrollmentsQuery.data ?? NO_ENROLLMENTS;
  const enrollmentIds = useMemo(() => enrollments.map((e) => e.id), [enrollments]);

  // AI suggestions for the pending enrollments. Fetched in parallel — the old
  // code awaited them one at a time, so a long queue trickled in slowly.
  const suggestionsQuery = useApiQuery<Record<string, MentorAssignmentSuggestion[]>>({
    queryKey: qk.admin.matchSuggestions(enrollmentIds),
    queryFn: async () => {
      const entries = await Promise.all(enrollmentIds.map(async (id) => {
        try {
          const sRes = await matchingApi.getSuggestions(id);
          return [id, sRes?.data?.suggestions || sRes?.suggestions || []] as const;
        } catch {
          return [id, []] as const; // non-fatal
        }
      }));
      return Object.fromEntries(entries);
    },
    enabled: enrollmentIds.length > 0,
  });

  const mentorsQuery = useApiQuery<MentorPage>({
    queryKey: qk.admin.availableMentors(mentorPage, debouncedMentorSearch.trim()),
    queryFn: async () => {
      const response = await mentorApi.getAll({
        ...(debouncedMentorSearch.trim() && { search: debouncedMentorSearch.trim() }),
        page: mentorPage,
        limit: MENTOR_LIMIT,
      });
      return {
        mentors: Array.isArray(response?.data?.mentors) ? response.data.mentors : [],
        totalPages: response?.pagination?.totalPages ?? 1,
        total: response?.pagination?.totalItems ?? 0,
      };
    },
  });

  const mentorsPage = mentorsQuery.data ?? NO_MENTOR_PAGE;
  const loading = programsQuery.loading || enrollmentsQuery.loading;
  const fetchEnrollments = enrollmentsQuery.refetch;

  // ── manually create a single match ────────────────────────────────────────
  const handleCreateMatch = useCallback(async (
    enrollmentId: string,
    mentorId: string,
  ) => {
    try {
      setMatching(enrollmentId);
      await matchingApi.createMatch({ enrollmentId, mentorId });
      toast.success('Match created successfully!');
      await fetchEnrollments();
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, 'Failed to create match'));
    } finally {
      setMatching(null);
    }
  }, [fetchEnrollments]);

  // ── auto-match all pending ─────────────────────────────────────────────────
  const handleAutoMatch = useCallback(async () => {
    const scope = selectedProgram ? ' in this program' : '';
    if (!(await confirm({ title: `Auto-match all pending enrollments${scope}?`, description: 'This will assign the top AI-suggested mentor to each unmatched mentee.' }))) return;
    try {
      setAutoMatching(true);
      const response = await matchingApi.autoMatchPending(selectedProgram || undefined);
      const { summary } = response?.data || {};
      toast.success(
        `Auto-match complete: ${summary?.matched ?? 0} matched, ${summary?.skipped ?? 0} skipped, ${summary?.failed ?? 0} failed`,
      );
      if ((summary?.matched ?? 0) > 0) await fetchEnrollments();
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, 'Auto-match failed'));
    } finally {
      setAutoMatching(false);
    }
  }, [selectedProgram, fetchEnrollments]);

  return {
    programs,
    selectedProgram,
    setSelectedProgram,
    enrollments,
    suggestions: suggestionsQuery.data ?? NO_SUGGESTIONS,
    loading,
    allMentors: mentorsPage.mentors,
    mentorsLoading: mentorsQuery.loading,
    mentorSearch,
    setMentorSearch,
    mentorPage,
    setMentorPage,
    mentorTotalPages: mentorsPage.totalPages,
    mentorTotal: mentorsPage.total,
    matching,
    autoMatching,
    handleCreateMatch,
    handleAutoMatch,
    refetchEnrollments: fetchEnrollments,
  };
}
