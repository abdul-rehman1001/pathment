/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useMemo } from 'react';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { programManagementApi } from '@/lib/services/program-api';

export interface UseMenteeProgramsReturn {
  programs: any[];
  filteredPrograms: any[];
  loading: boolean;
  searchQuery: string;
  statusFilter: string;
  setSearchQuery: (v: string) => void;
  setStatusFilter: (v: string) => void;
  fetchPrograms: () => Promise<void>;
}

const EMPTY: any[] = [];

export function useMenteePrograms(): UseMenteeProgramsReturn {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data, loading, refetch } = useApiQuery<any[]>({
    queryKey: qk.me.publicPrograms,
    queryFn: async () => {
      // programsApi.getAll returns response (already response.data from apiClient);
      // server body: { data: Program[] }
      const response = await programManagementApi.programs.getAll({ status: 'published' });
      const list = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
      return list.filter((program: any) => program?.status !== 'draft');
    },
    staleTime: STALE.long,
    errorMessage: 'Failed to load programs',
  });

  const programs = data ?? EMPTY;

  const filteredPrograms = useMemo(() => {
    return programs.filter((program) => {
      const matchesSearch =
        program.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        program.description?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || program.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [programs, searchQuery, statusFilter]);

  return {
    programs,
    filteredPrograms,
    loading,
    searchQuery,
    statusFilter,
    setSearchQuery,
    setStatusFilter,
    fetchPrograms: refetch,
  };
}
