import { useState, useEffect } from 'react';
import { qk, useApiQuery } from '@/lib/query';
import { enrollmentApi } from '@/lib/services/enrollment-api';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { useDebounce } from '@/lib/hooks/shared/useDebounce';

export type EnrollmentStatus =
  | 'pending_approval'
  | 'approved'
  | 'pending_match'
  | 'matched'
  | 'active'
  | 'pending_completion'
  | 'level_completed'
  | 'program_completed'
  | 'rejected'
  | 'dropped';

export interface Enrollment {
  id: string;
  menteeId: string;
  programId: string;
  status: EnrollmentStatus;
  currentWeek: number;
  tasksCompleted: number;
  tasksTotal: number;
  overallProgressPercentage: string;
  enrolledAt: string;
  completionRequestedAt?: string;
  completionRequestedByRole?: string;
  completionRejectionReason?: string;
  mentee: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    profilePictureUrl?: string | null;
  };
  program: {
    id: string;
    name: string;
    type: string;
    status: string;
  };
  clan?: { id: string; name: string; leadMentor?: { id: string; firstName: string; lastName: string; email: string; profilePictureUrl?: string | null } | null } | null;
  matches: Array<{
    id: string;
    status: string;
    mentor: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      profilePictureUrl?: string | null;
    };
  }>;
}

interface EnrollmentStats {
  total: number; active: number; pendingMatch: number;
  pendingCompletion: number; completed: number; dropped: number;
}
interface EnrollmentPage { enrollments: Enrollment[]; total?: number }

const NO_ENROLLMENTS: Enrollment[] = [];
const NO_STATS: EnrollmentStats = {
  total: 0, active: 0, pendingMatch: 0, pendingCompletion: 0, completed: 0, dropped: 0,
};

export function useEnrollmentList() {
  const pagination = usePagination({ initialPage: 1, initialLimit: 10 });

  const [search, setSearchInput] = useState('');
  const [status, setStatus] = useState<EnrollmentStatus | 'all'>('all');

  const debouncedSearch = useDebounce(search, 400);

  const statsQuery = useApiQuery<EnrollmentStats>({
    queryKey: qk.admin.enrollmentStats,
    queryFn: async () => {
      const res = await enrollmentApi.getStats() as { data?: { stats?: EnrollmentStats } };
      return res?.data?.stats ?? NO_STATS;
    },
  });

  const { data, loading: isLoading, error, refetch } = useApiQuery<EnrollmentPage>({
    queryKey: qk.admin.enrollmentList({
      page: pagination.page, limit: pagination.limit, search: debouncedSearch, status,
    }),
    queryFn: async () => {
      const response = await enrollmentApi.getAll({
        page: pagination.page,
        limit: pagination.limit,
        ...(status !== 'all' && { status }),
        ...(debouncedSearch && { search: debouncedSearch }),
      });
      return {
        enrollments: response?.data?.enrollments ?? [],
        total: response?.data?.pagination?.total,
      };
    },
    errorMessage: 'Failed to load enrollments',
  });

  const enrollments = data?.enrollments ?? NO_ENROLLMENTS;
  const stats = statsQuery.data ?? NO_STATS;

  // The page total belongs to the pagination helper, not the query.
  const total = data?.total;
  useEffect(() => {
    if (total !== undefined) pagination.setTotal(total);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // Reset to page 1 whenever a filter changes
  useEffect(() => {
    pagination.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, status]);

  const hasActiveFilters = !!(debouncedSearch || status !== 'all');

  return {
    // Data
    enrollments,
    isLoading,
    error,
    isEmpty: !isLoading && !error && enrollments.length === 0,

    // Pagination
    pagination,

    // Filters
    search,
    status,
    hasActiveFilters,
    setSearch: setSearchInput,
    setStatus,
    resetFilters: () => {
      setSearchInput('');
      setStatus('all');
    },

    // Derived
    stats,

    // Actions
    refetch,
  };
}
