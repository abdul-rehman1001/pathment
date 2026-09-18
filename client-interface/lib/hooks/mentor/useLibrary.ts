'use client';

import { libraryApi } from '@/lib/services/library-api';
import { qk, useApiQuery, STALE } from '@/lib/query';

export interface LibraryDoc {
  id: string;
  title: string;
  category: 'guidance' | 'reading' | 'template' | 'policy';
  summary: string | null;
  author: string | null;
  url: string | null;
  readMins: number | null;
  pinned: boolean;
  hasContent: boolean;
  content?: string;
  updatedAt: string;
}

export interface UseLibraryReturn {
  documents: LibraryDoc[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const EMPTY: LibraryDoc[] = [];

export function useLibrary(): UseLibraryReturn {
  const { data, loading, error, refetch } = useApiQuery<LibraryDoc[]>({
    queryKey: qk.mentor.library,
    queryFn: async () => (await libraryApi.list())?.data?.documents ?? [],
    staleTime: STALE.long,
    errorMessage: 'Failed to load the library',
  });

  return { documents: data ?? EMPTY, loading, error, refetch };
}
