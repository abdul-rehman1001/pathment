'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { qk, useApiQuery } from '@/lib/query';
import { programsApi } from '@/lib/services/program-api';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { useDebounce } from '@/lib/hooks/shared/useDebounce';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import type { Program } from '@/lib/types';

export type ProgramStatus = 'all' | 'draft' | 'published' | 'completed' | 'archived';
export type ProgramSortBy = 'createdAt' | 'name' | 'startDate';
export type SortOrder = 'ASC' | 'DESC';

export interface UseProgramListReturn {
  programs: Program[];
  isLoading: boolean;
  error: string | null;
  isEmpty: boolean;
  pagination: ReturnType<typeof usePagination>;
  // filters
  search: string;
  status: ProgramStatus;
  type: string;
  sortBy: ProgramSortBy;
  sortOrder: SortOrder;
  hasActiveFilters: boolean;
  // actions
  setSearch: (v: string) => void;
  setStatus: (v: ProgramStatus) => void;
  setType: (v: string) => void;
  setSortBy: (v: ProgramSortBy) => void;
  setSortOrder: (v: SortOrder) => void;
  resetFilters: () => void;
  refetch: () => void;
  handleDelete: (id: string) => Promise<void>;
}

interface ProgramPage { programs: Program[]; total: number }

const NO_PROGRAMS: Program[] = [];

export function useProgramList(): UseProgramListReturn {

  const [search, setSearchRaw] = useState('');
  const [status, setStatusRaw] = useState<ProgramStatus>('all');
  const [type, setTypeRaw] = useState('all');
  const [sortBy, setSortByRaw] = useState<ProgramSortBy>('createdAt');
  const [sortOrder, setSortOrderRaw] = useState<SortOrder>('DESC');

  const debouncedSearch = useDebounce(search, 400);
  const pagination = usePagination({ initialLimit: 10 });

  // Reset to page 1 when any filter changes
  const setSearch = useCallback((v: string) => { setSearchRaw(v); pagination.reset(); }, [pagination]);
  const setStatus = useCallback((v: ProgramStatus) => { setStatusRaw(v); pagination.reset(); }, [pagination]);
  const setType   = useCallback((v: string) => { setTypeRaw(v); pagination.reset(); }, [pagination]);
  const setSortBy = useCallback((v: ProgramSortBy) => { setSortByRaw(v); pagination.reset(); }, [pagination]);
  const setSortOrder = useCallback((v: SortOrder) => { setSortOrderRaw(v); pagination.reset(); }, [pagination]);

  const resetFilters = useCallback(() => {
    setSearchRaw('');
    setStatusRaw('all');
    setTypeRaw('all');
    setSortByRaw('createdAt');
    setSortOrderRaw('DESC');
    pagination.reset();
  }, [pagination]);

  const { data, loading, error, refetch } = useApiQuery<ProgramPage>({
    queryKey: qk.admin.programList({
      search: debouncedSearch.trim(), status, type, sortBy, sortOrder,
      page: pagination.page, limit: pagination.limit,
    }),
    queryFn: async () => {
      const response = await programsApi.getAll({
        ...(debouncedSearch.trim() && { search: debouncedSearch.trim().slice(0, 100) }),
        ...(status !== 'all' && { status }),
        ...(type !== 'all' && { type }),
        sortBy,
        sortOrder,
        page: pagination.page,
        limit: pagination.limit,
      });
      const total = response?.pagination?.totalItems
        ?? response?.pagination?.total
        ?? (response?.pagination?.totalPages ? response.pagination.totalPages * pagination.limit : 0);
      return { programs: Array.isArray(response?.data) ? response.data : [], total };
    },
    errorMessage: 'Failed to load programs',
  });

  const programs = data?.programs ?? NO_PROGRAMS;
  const isLoading = loading;
  const fetchPrograms = refetch;

  // The page total belongs to the pagination helper, not the query.
  const total = data?.total;
  useEffect(() => {
    if (typeof total === 'number') pagination.setTotal(total);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);


  const handleDelete = useCallback(async (id: string) => {
    try {
      const { programsApi: api } = await import('@/lib/services/program-api');
      await api.delete(id);
      toast.success('Program deleted successfully');
      fetchPrograms();
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to delete program'));
      throw err;
    }
  }, [fetchPrograms]);

  const hasActiveFilters =
    search.trim() !== '' || status !== 'all' || type !== 'all' ||
    sortBy !== 'createdAt' || sortOrder !== 'DESC';

  return {
    programs,
    isLoading,
    error,
    isEmpty: !isLoading && !error && programs.length === 0,
    pagination,
    search,
    status,
    type,
    sortBy,
    sortOrder,
    hasActiveFilters,
    setSearch,
    setStatus,
    setType,
    setSortBy,
    setSortOrder,
    resetFilters,
    refetch: fetchPrograms,
    handleDelete,
  };
}
