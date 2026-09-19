'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useAutoReply } from './useAutoReply';
import { useAIQuota } from '../shared/useAIConnections';
import { qk, useApiQuery, STALE } from '@/lib/query';
import { messagingApi } from '@/lib/services/messaging-api';

export interface Document {
  id: string;
  fileName: string;
  status: 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  createdAt: string;
}

interface UseDocumentsTabProps {
  autoReplyEnabled?: boolean;
  onAutoReplyChange?: (enabled: boolean) => Promise<void> | void;
}

const NO_DOCUMENTS: Document[] = [];

/**
 * Smart TanStack Query hook managing DocumentsTab domain logic:
 * - Auto-reply status & readiness
 * - Auto-reply monthly quota (count, limit, updates)
 * - Knowledge base document fetching & real-time processing polling
 * - PDF file uploading & document deletion
 */
export function useDocumentsTab({ autoReplyEnabled = false, onAutoReplyChange }: UseDocumentsTabProps = {}) {
  const { status, refetch: refetchStatus } = useAutoReply();
  const { quota, setQuotaLimit } = useAIQuota();

  const [uploading, setUploading] = useState(false);
  const [deleteDocumentId, setDeleteDocumentId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const canEnable = status?.canEnable ?? false;
  const steps = status?.steps ?? [];

  // Poll only while something is still processing
  const { data: documents = NO_DOCUMENTS, loading, refetch: fetchDocuments } = useApiQuery<Document[]>({
    queryKey: qk.messaging.mentorDocuments,
    queryFn: () => messagingApi.getMentorDocuments(),
    staleTime: STALE.short,
    refetchInterval: (docs) => (docs?.some((d) => d.status === 'processing') ? 10_000 : false),
    errorMessage: 'Failed to load documents',
  });

  const handleToggleAutoReply = useCallback(async () => {
    if (!onAutoReplyChange) return;

    if (!autoReplyEnabled && !canEnable) {
      toast.error('Finish the setup below first');
      return;
    }

    setToggling(true);
    try {
      await onAutoReplyChange(!autoReplyEnabled);
      await refetchStatus();
    } finally {
      setToggling(false);
    }
  }, [autoReplyEnabled, canEnable, onAutoReplyChange, refetchStatus]);

  const uploadFile = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are supported.');
      return false;
    }

    setUploading(true);
    try {
      await messagingApi.uploadMentorDocument(file);
      toast.success('Document uploaded successfully. It is now processing.');
      await fetchDocuments();
      return true;
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to upload document.');
      return false;
    } finally {
      setUploading(false);
    }
  }, [fetchDocuments]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteDocumentId) return;
    setDeleting(true);
    try {
      await messagingApi.deleteMentorDocument(deleteDocumentId);
      toast.success('Document deleted');
      await fetchDocuments();
    } catch {
      toast.error('Failed to delete document');
    } finally {
      setDeleting(false);
      setDeleteDocumentId(null);
    }
  }, [deleteDocumentId, fetchDocuments]);

  return {
    documents,
    loading,
    status,
    quota,
    canEnable,
    steps,
    uploading,
    deleting,
    toggling,
    deleteDocumentId,
    setDeleteDocumentId,
    handleToggleAutoReply,
    uploadFile,
    handleDeleteConfirm,
    setQuotaLimit,
    refetchDocuments: fetchDocuments,
  };
}
