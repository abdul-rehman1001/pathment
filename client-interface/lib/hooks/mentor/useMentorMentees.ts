/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useMemo } from 'react';
import { matchingApi } from '@/lib/services/enrollment-api';
import { useAuth } from '@/lib/context/AuthContext';
import { qk, useApiQuery } from '@/lib/query';

export interface UseMentorMenteesReturn {
  matches: any[];
  filteredMatches: any[];
  programs: string[];
  loading: boolean;
  searchTerm: string;
  filterProgram: string;
  setSearchTerm: (v: string) => void;
  setFilterProgram: (v: string) => void;
  fetchMyMatches: () => Promise<void>;
}

const EMPTY_MATCHES: any[] = [];

export function useMentorMentees(): UseMentorMenteesReturn {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProgram, setFilterProgram] = useState('all');

  const { data, loading, refetch } = useApiQuery<any[]>({
    queryKey: [...qk.mentor.mentees, user?.id ?? ''],
    queryFn: async () => {
      const response = await matchingApi.getMatches({ mentorId: user!.id, status: 'active' });
      return response?.data?.matches || response?.matches || [];
    },
    enabled: !!user?.id,
    errorMessage: 'Failed to load your mentees',
  });

  const matches = data ?? EMPTY_MATCHES;

  const programs = useMemo(
    () => [...new Set(matches.map((m) => m.enrollment?.program?.name))].filter(Boolean) as string[],
    [matches]
  );

  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      const mentee = match.mentee;
      const program = match.enrollment?.program?.name || '';
      const matchesSearch =
        searchTerm === '' ||
        mentee?.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        mentee?.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        program.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesProgram = filterProgram === 'all' || program === filterProgram;
      return matchesSearch && matchesProgram;
    });
  }, [matches, searchTerm, filterProgram]);

  return {
    matches,
    filteredMatches,
    programs,
    loading,
    searchTerm,
    filterProgram,
    setSearchTerm,
    setFilterProgram,
    fetchMyMatches: refetch,
  };
}
