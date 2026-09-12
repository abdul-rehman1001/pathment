/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { programManagementApi } from '@/lib/services/program-api';
import { enrollmentApi } from '@/lib/services/enrollment-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { toast } from 'sonner';
import { qk, useApiQuery } from '@/lib/query';
import { useAuth } from '@/lib/context/AuthContext';

export interface UseProgramEnrollReturn {
  program: any;
  loading: boolean;
  enrolling: boolean;
  existingEnrollment: any;
  showConfirmDialog: boolean;
  setShowConfirmDialog: (v: boolean) => void;
  handleEnroll: () => Promise<void>;
}

export function useProgramEnroll(programId: string): UseProgramEnrollReturn {
  const { user } = useAuth();
  const router = useRouter();

  const [enrolling, setEnrolling] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const programQuery = useApiQuery<any>({
    queryKey: qk.me.program(programId),
    queryFn: async () => {
      const response = await programManagementApi.programs.getById(programId);
      return response?.data?.program || response?.program || response;
    },
    enabled: !!programId,
    errorMessage: 'Failed to load program details',
  });

  const enrollmentQuery = useApiQuery<any>({
    queryKey: qk.me.programEnrollment(programId, user?.id ?? ''),
    queryFn: async () => {
      const response = await enrollmentApi.getAll({ programId, menteeId: user!.id });
      const list = response?.data?.enrollments || response?.enrollments || [];
      return list[0] ?? null;
    },
    enabled: !!programId && !!user?.id,
  });

  const program = programQuery.data ?? null;
  const existingEnrollment = enrollmentQuery.data ?? null;
  const loading = programQuery.loading || enrollmentQuery.loading;

  const handleEnroll = useCallback(async () => {
    try {
      setEnrolling(true);
      await enrollmentApi.create({ programId });
      toast.success('Enrollment request submitted! Awaiting admin approval.');
      setShowConfirmDialog(false);
      setTimeout(() => router.push('/mentee/dashboard'), 1500);
    } catch (err: any) {
      toast.error(extractApiErrorMessage(err, 'Failed to submit enrollment request'));
      setShowConfirmDialog(false);
    } finally {
      setEnrolling(false);
    }
  }, [programId, router]);

  return {
    program,
    loading,
    enrolling,
    existingEnrollment,
    showConfirmDialog,
    setShowConfirmDialog,
    handleEnroll,
  };
}
