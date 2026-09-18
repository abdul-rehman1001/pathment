'use client';

import { useState, useEffect } from 'react';
import { qk, useApiQuery } from '@/lib/query';
import { mentorApi } from '@/lib/services/enrollment-api';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { useDebounce } from '@/lib/hooks/shared/useDebounce';

export interface MentorListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  createdAt: string;
  lastLoginAt?: string | null;
  profilePictureUrl?: string | null;
  activeMentees?: number;
  clans?: { id: string; name: string; role: string }[];
  specializations?: string[];
  mentorProfile?: {
    title?: string;
    organization?: string;
    specialization?: string[];
    maxMentees?: number;
    currentMenteeCount?: number;
    isAcceptingMentees?: boolean;
    avgFeedbackRating?: number;
    totalMenteesGuided?: number;
    yearsOfExperience?: number;
  };
}

export type AcceptingFilter = 'all' | 'accepting' | 'not_accepting';

interface UseMentorsListReturn {
  mentors: MentorListItem[];
  isLoading: boolean;
  error: string | null;
  pagination: ReturnType<typeof usePagination>;
  search: string;
  setSearch: (v: string) => void;
  acceptingFilter: AcceptingFilter;
  setAcceptingFilter: (v: AcceptingFilter) => void;
  refetch: () => Promise<void>;
}

interface MentorPage { mentors: MentorListItem[]; total?: number }

const NO_MENTORS: MentorListItem[] = [];

export function useMentorsList(): UseMentorsListReturn {
  const pagination = usePagination({ initialPage: 1, initialLimit: 20 });
  const [search, setSearchInput] = useState('');
  const [acceptingFilter, setAcceptingFilter] = useState<AcceptingFilter>('all');
  const debouncedSearch = useDebounce(search, 400);

  const { data, loading, error, refetch } = useApiQuery<MentorPage>({
    queryKey: [...qk.admin.mentorList(pagination.page, pagination.limit, debouncedSearch.trim()), acceptingFilter],
    queryFn: async () => {
      const response = await mentorApi.getAll({
        ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
        page: pagination.page,
        limit: pagination.limit,
        ...(acceptingFilter !== 'all' && {
          accepting: acceptingFilter === 'accepting' ? 'true' : 'false',
        }),
      });
      return { mentors: response?.data?.mentors ?? [], total: response?.pagination?.totalItems };
    },
    errorMessage: 'Failed to load mentors',
  });

  const mentors = data?.mentors ?? NO_MENTORS;
  const isLoading = loading;

  const total = data?.total;
  useEffect(() => {
    if (total !== undefined) pagination.setTotal(total);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // Reset to page 1 on filter/search change
  useEffect(() => {
    pagination.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, acceptingFilter]);

  return {
    mentors,
    isLoading,
    error,
    pagination,
    search,
    setSearch: setSearchInput,
    acceptingFilter,
    setAcceptingFilter,
    refetch,
  };
}
