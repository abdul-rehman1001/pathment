'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { qk, useApiQuery } from '@/lib/query';
import { useParams } from 'next/navigation';
import { programManagementApi } from '@/lib/services/program-api';
import { enrollmentApi } from '@/lib/services/enrollment-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';

export type ProgramDetailTab = 'overview' | 'enrollments';

export interface ProgramDetailProgram {
  id: string;
  name: string;
  description?: string;
  status: string;
  visibility?: string;
  type: string;
  tags?: string[];
  totalDurationWeeks?: number;
  estimatedHoursPerWeek?: number;
  startDate?: string;
  endDate?: string;
  createdAt: string;
  _count?: { enrollments?: number; mentors?: number };
  enrollmentCount?: number;
  mentorCount?: number;
  completion?: number;
}

export interface ProgramEnrollment {
  id: string;
  status: string;
  enrolledAt: string;
  mentee?: { id: string; firstName: string; lastName: string; email: string };
  clan?: { id: string; name: string } | null;
}

interface UseProgramDetailReturn {
  id: string;
  program: ProgramDetailProgram | null;
  loading: boolean;
  enrollments: ProgramEnrollment[];
  loadingEnrollments: boolean;
  shareOpen: boolean;
  shareRef: React.RefObject<HTMLDivElement>;
  setShareOpen: (open: boolean) => void;
  copyToClipboard: (text: string, label: string) => void;
  handleApproveEnrollment: (enrollmentId: string) => Promise<void>;
  handleRejectEnrollment: (enrollmentId: string) => Promise<void>;
  handleStatusUpdate: (newStatus: string) => Promise<void>;
  handleVisibilityUpdate: (newVisibility: string) => Promise<void>;
  updatingStatus: boolean;
  fetchEnrollments: () => Promise<void>;
  /** HTTP status when the load failed — lets the page tell 403 from 404. */
  errorStatus: number | null;
  refetch: () => Promise<void>;
}

const NO_ENROLLMENTS: ProgramEnrollment[] = [];

export function useProgramDetail(): UseProgramDetailReturn {
  const params = useParams();
  const id = params?.id as string;

  const client = useQueryClient();
  const [shareOpen, setShareOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null!);

  const { data: program, loading, errorStatus, refetch: fetchProgram } = useApiQuery<ProgramDetailProgram | null>({
    queryKey: qk.admin.program(id),
    queryFn: async () => {
      const response = (await programManagementApi.programs.getById(id)) as {
        data?: { program?: ProgramDetailProgram };
        program?: ProgramDetailProgram;
      };
      return response?.data?.program ?? response?.program ?? null;
    },
    enabled: !!id,
    errorMessage: 'Failed to load program',
  });

  // Loaded on demand (when the page opens the enrolments tab), as before.
  const {
    data: enrollments, loading: loadingEnrollments, refetch: fetchEnrollments,
  } = useApiQuery<ProgramEnrollment[]>({
    queryKey: qk.admin.programEnrollments(id),
    queryFn: async () => {
      const response = (await enrollmentApi.getAll({ programId: id })) as {
        data?: { enrollments?: ProgramEnrollment[] };
        enrollments?: ProgramEnrollment[];
      };
      return response?.data?.enrollments ?? response?.enrollments ?? [];
    },
    enabled: false,
    errorMessage: 'Failed to load enrollments',
  });

  /** Optimistic patch of the cached program, with the previous value returned. */
  const patchProgram = useCallback((patch: Partial<ProgramDetailProgram>) => {
    client.setQueryData<ProgramDetailProgram | null>(
      qk.admin.program(id), (prev) => (prev ? { ...prev, ...patch } : prev)
    );
  }, [client, id]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShareOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleApproveEnrollment = useCallback(async (enrollmentId: string) => {
    try {
      await enrollmentApi.approve(enrollmentId);
      toast.success('Enrollment approved successfully');
      await fetchEnrollments();
    } catch (err: unknown) {
      console.error('Failed to approve enrollment:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to approve enrollment'));
    }
  }, [fetchEnrollments]);

  const handleRejectEnrollment = useCallback(async (enrollmentId: string) => {
    const reason = prompt('Reason for rejection (optional):');
    try {
      await enrollmentApi.reject(enrollmentId, reason ?? undefined);
      toast.success('Enrollment rejected');
      await fetchEnrollments();
    } catch (err: unknown) {
      console.error('Failed to reject enrollment:', err);
      toast.error(extractApiErrorMessage(err, 'Failed to reject enrollment'));
    }
  }, [fetchEnrollments]);

  const handleStatusUpdate = useCallback(async (newStatus: string) => {
    if (!program) return;
    const prevStatus = program.status;
    // Optimistic update
    patchProgram({ status: newStatus });
    setUpdatingStatus(true);
    try {
      await (programManagementApi.programs.update as (id: string, data: object) => Promise<unknown>)(id, { status: newStatus });
      const labels: Record<string, string> = {
        published: 'Program published successfully',
        archived: 'Program archived successfully',
        completed: 'Program marked as completed',
        draft: 'Program restored to draft',
      };
      toast.success(labels[newStatus] ?? 'Status updated successfully');
    } catch (err: unknown) {
      // Roll back optimistic update on failure
      patchProgram({ status: prevStatus });
      toast.error(extractApiErrorMessage(err, 'Failed to update program status'));
    } finally {
      setUpdatingStatus(false);
    }
  }, [id, program, patchProgram]);

  const handleVisibilityUpdate = useCallback(async (newVisibility: string) => {
    if (!program) return;
    const prev = (program as { visibility?: string }).visibility;
    patchProgram({ visibility: newVisibility } as Partial<ProgramDetailProgram>);
    setUpdatingStatus(true);
    try {
      await (programManagementApi.programs.update as (id: string, data: object) => Promise<unknown>)(id, { visibility: newVisibility });
      toast.success(newVisibility === 'public' ? 'Program is now public' : 'Program is now private');
    } catch (err: unknown) {
      patchProgram({ visibility: prev } as Partial<ProgramDetailProgram>);
      toast.error(extractApiErrorMessage(err, 'Failed to update visibility'));
    } finally {
      setUpdatingStatus(false);
    }
  }, [id, program, patchProgram]);

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success(`${label} copied to clipboard!`);
        setShareOpen(false);
      })
      .catch(() => toast.error('Failed to copy to clipboard'));
  }, []);

  return {
    id,
    program: program ?? null,
    loading,
    enrollments: enrollments ?? NO_ENROLLMENTS,
    loadingEnrollments,
    shareOpen,
    shareRef,
    setShareOpen,
    copyToClipboard,
    handleApproveEnrollment,
    handleRejectEnrollment,
    handleStatusUpdate,
    handleVisibilityUpdate,
    updatingStatus,
    fetchEnrollments,
    errorStatus,
    refetch: fetchProgram,
  };
}
