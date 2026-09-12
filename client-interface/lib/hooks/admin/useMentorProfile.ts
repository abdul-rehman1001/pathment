'use client';

import { qk, useApiQuery } from '@/lib/query';
import { useParams } from 'next/navigation';
import { mentorApi } from '@/lib/services/enrollment-api';

export interface MentorProfileData {
  title?: string;
  organization?: string;
  yearsOfExperience?: number;
  specialization?: string[];
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  maxMentees?: number;
  currentMenteeCount?: number;
  avgResponseTimeHours?: number;
  totalMenteesGuided?: number;
  successRate?: number;
  avgFeedbackRating?: number;
  totalTasksReviewed?: number;
  isAcceptingMentees?: boolean;
  preferredMenteeLevel?: string[];
}

export interface MentorSkill {
  id: string;
  name: string;
  category?: string;
  UserSkill?: { proficiencyLevel?: string };
}

export interface MentorActiveMatch {
  id: string;
  mentee?: { id: string; firstName: string; lastName: string; email: string; profilePictureUrl?: string | null };
  enrollment?: {
    id: string;
    status: string;
    overallProgressPercentage?: number;
    program?: { id: string; name: string };
  };
}

export interface MentorDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  profilePictureUrl?: string;
  createdAt: string;
  mentorProfile?: MentorProfileData;
  skills?: MentorSkill[];
}

interface UseMentorProfileReturn {
  mentor: MentorDetail | null;
  activeMatches: MentorActiveMatch[];
  isLoading: boolean;
  error: string | null;
  /** HTTP status when the load failed — lets the page tell 403 from 404. */
  errorStatus: number | null;
  refetch: () => Promise<void>;
}

interface MentorWithMatches {
  mentor: MentorDetail | null;
  activeMatches: MentorActiveMatch[];
}

const EMPTY: MentorWithMatches = { mentor: null, activeMatches: [] };

export function useMentorProfile(): UseMentorProfileReturn {
  const { id } = useParams<{ id: string }>();

  const { data, loading, error, errorStatus, refetch } = useApiQuery<MentorWithMatches>({
    queryKey: qk.admin.mentorProfile(id ?? ''),
    queryFn: async () => {
      const response = (await mentorApi.getById(id)) as {
        data?: { mentor?: MentorDetail; activeMatches?: MentorActiveMatch[] };
        mentor?: MentorDetail;
        activeMatches?: MentorActiveMatch[];
      };
      return {
        mentor: response?.data?.mentor ?? response?.mentor ?? null,
        activeMatches: response?.data?.activeMatches ?? response?.activeMatches ?? [],
      };
    },
    enabled: !!id,
    errorMessage: 'Failed to load mentor profile',
  });

  return { ...(data ?? EMPTY), isLoading: loading, error, errorStatus, refetch };
}
