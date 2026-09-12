'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { useAuth } from '@/lib/context/AuthContext';
import { publicApi, type PublicClanJoinInfo } from '@/lib/services/public-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

export interface UsePublicClanJoinPageReturn {
  info: PublicClanJoinInfo | null;
  loading: boolean;
  unavailable: boolean;
  submitting: boolean;
  submitted: boolean;
  message: string;
  setMessage: (value: string) => void;
  loginHref: string;
  registerHref: string;
  /** After approval: dashboard if logged in, otherwise login then dashboard. */
  continueHref: string;
  submitRequest: () => Promise<void>;
}

/** Public `/clan/join/:token` page: load preview + submit join request. */
export function usePublicClanJoinPage(token: string): UsePublicClanJoinPageReturn {
  const { user, isLoading: authLoading } = useAuth();
  const [info, setInfo] = useState<PublicClanJoinInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');

  const joinPath = `/clan/join/${encodeURIComponent(token)}`;
  const loginHref = `/login?next=${encodeURIComponent(joinPath)}`;
  const registerHref = `/register?clanJoin=${encodeURIComponent(token)}`;
  const continueHref = user
    ? '/mentee/dashboard'
    : `/login?next=${encodeURIComponent('/mentee/dashboard')}`;

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setUnavailable(false);
    try {
      const data = await publicApi.getClanJoin(token);
      setInfo(data);
      if (data.viewerStatus === 'pending') setSubmitted(true);
    } catch {
      setInfo(null);
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token || authLoading) return;
    reload();
  }, [token, authLoading, user?.id, reload]);

  const submitRequest = useCallback(async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const trimmed = message.trim();
      await publicApi.submitClanJoinRequest(token, trimmed || undefined);
      setSubmitted(true);
      setMessage('');
      toast.success('Your join request was sent to the Clan Lead Mentor.');
      await reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not submit join request'));
    } finally {
      setSubmitting(false);
    }
  }, [token, message, reload]);

  return {
    info,
    loading: loading || authLoading,
    unavailable,
    submitting,
    submitted,
    message,
    setMessage,
    loginHref,
    registerHref,
    continueHref,
    submitRequest,
  };
}
