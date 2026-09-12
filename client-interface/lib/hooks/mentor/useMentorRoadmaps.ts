'use client';

import { mentorApi } from '@/lib/services/mentor-api';
import { qk, useApiQuery, STALE } from '@/lib/query';

export interface RoadmapStep {
  id: string;
  title: string;
  description?: string;
  type: string;
  taskOrder: number;
  acceptanceCriteria?: string[];
  effort?: string | null;
  dueOffsetDays?: number | null;
  difficulty?: string | null;
  deliverable?: string | null;
  pointsBase?: number | null;
  resources?: { id?: string; title: string; url: string; resourceType?: string | null }[];
}

export interface LinearRoadmap {
  id: string;
  name: string;
  description?: string;
  source: 'org' | 'local';
  published: boolean;
  importedFrom?: string | null;
  skillTags: string[];
  programId: string;
  steps: RoadmapStep[];
  /** Local roadmaps only: false when it belongs to a clan teammate (shared,
   *  assignable but not editable by the viewer). Undefined for org roadmaps. */
  isOwner?: boolean;
}

export interface UseMentorRoadmapsReturn {
  local: LinearRoadmap[];
  org: LinearRoadmap[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface Roadmaps { local: LinearRoadmap[]; org: LinearRoadmap[] }

const EMPTY: Roadmaps = { local: [], org: [] };

export function useMentorRoadmaps(): UseMentorRoadmapsReturn {
  const { data, loading, error, refetch } = useApiQuery<Roadmaps>({
    queryKey: qk.mentor.roadmaps,
    queryFn: async () => {
      const res = await mentorApi.listRoadmaps();
      return { local: res?.data?.local ?? [], org: res?.data?.org ?? [] };
    },
    staleTime: STALE.long,
    errorMessage: 'Failed to load roadmaps',
  });

  return { ...(data ?? EMPTY), loading, error, refetch };
}
