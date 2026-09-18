'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { qk, useApiQuery, useInvalidate } from '@/lib/query';
import { useConfirm } from '@/lib/context/ConfirmContext';
import { clanApi, type ClanJoinRequestRow, type PublicJoinState } from '@/lib/services/clan-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { getBrowserTimeZone, splitLocal } from '@/lib/utils/datetime';

export type PublicJoinWindowDraft = {
  startsDate: string;
  startsTime: string;
  endsDate: string;
  endsTime: string;
};

export interface UseClanPublicJoinReturn {
  state: PublicJoinState | null;
  requests: ClanJoinRequestRow[];
  pendingCount: number;
  loading: boolean;
  busy: boolean;
  actingId: string | null;
  windowDraft: PublicJoinWindowDraft;
  setWindowDraft: (patch: Partial<PublicJoinWindowDraft>) => void;
  copyLink: () => Promise<void>;
  generate: () => Promise<void>;
  saveJoinWindow: () => Promise<void>;
  disable: () => Promise<void>;
  regenerate: () => Promise<void>;
  approve: (requestId: string) => Promise<boolean>;
  reject: (requestId: string, note?: string) => Promise<boolean>;
}

const EMPTY_REQUESTS: ClanJoinRequestRow[] = [];
const EMPTY_DRAFT: PublicJoinWindowDraft = {
  startsDate: '',
  startsTime: '',
  endsDate: '',
  endsTime: '',
};

export function publicJoinRequestLabel(req: ClanJoinRequestRow) {
  if (!req.user) return 'Unknown user';
  return `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || req.user.email;
}

export function publicJoinBlockedMessage(req: ClanJoinRequestRow): string | null {
  if (req.blockedReason === 'member_elsewhere') {
    return `Already a mentee of ${req.placedElsewhere?.clanName || 'another clan'}. Approve is blocked — ask an admin to reassign.`;
  }
  if (req.blockedReason === 'clan_full') {
    return 'This clan is at capacity. Free a seat before approving.';
  }
  if (req.blockedReason === 'user_inactive') {
    return 'This account is not active, so they cannot be added right now.';
  }
  return null;
}

export function publicJoinRequesterLocation(req: ClanJoinRequestRow): string | null {
  const parts = [req.user?.city, req.user?.country].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function draftFromState(next: PublicJoinState): PublicJoinWindowDraft {
  const starts = splitLocal(next.publicJoinStartsAt);
  const ends = splitLocal(next.publicJoinEndsAt);
  return {
    startsDate: starts.date,
    startsTime: starts.time,
    endsDate: ends.date,
    endsTime: ends.time,
  };
}

/** Lead-mentor public joining link, join window, and pending request decisions. */
export function useClanPublicJoin(clanId: string): UseClanPublicJoinReturn {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [windowDraft, setWindowDraftState] = useState<PublicJoinWindowDraft>(EMPTY_DRAFT);

  const enabled = !!clanId;
  const requestsKey = qk.clan.joinRequests(clanId, 'pending');

  const { data: state = null, loading: stateLoading, error: stateError } = useApiQuery<PublicJoinState | null>({
    queryKey: qk.clan.publicJoin(clanId),
    queryFn: () => clanApi.getPublicJoinState(clanId),
    enabled,
    errorMessage: 'Could not load public joining settings',
  });

  const { data: requests = EMPTY_REQUESTS, loading: requestsLoading } = useApiQuery<ClanJoinRequestRow[]>({
    queryKey: requestsKey,
    queryFn: () => clanApi.listJoinRequests(clanId, 'pending').catch(() => []),
    enabled,
  });

  useEffect(() => {
    if (stateError) toast.error(stateError);
  }, [stateError]);

  // Only overwrite the form when the server window actually changes, so a
  // background refetch cannot wipe in-progress edits.
  useEffect(() => {
    setWindowDraftState(state ? draftFromState(state) : EMPTY_DRAFT);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on window fields, not object identity
  }, [clanId, state?.publicJoinStartsAt, state?.publicJoinEndsAt]);

  const setWindowDraft = useCallback((patch: Partial<PublicJoinWindowDraft>) => {
    setWindowDraftState((prev) => ({ ...prev, ...patch }));
  }, []);

  const windowPayload = useCallback(() => ({
    timezone: getBrowserTimeZone(),
    startsDate: windowDraft.startsDate || null,
    startsTime: windowDraft.startsTime || null,
    endsDate: windowDraft.endsDate || null,
    endsTime: windowDraft.endsTime || null,
  }), [windowDraft]);

  const copyLink = useCallback(async () => {
    if (!state?.publicJoinUrl) return;
    try {
      await navigator.clipboard.writeText(state.publicJoinUrl);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy link');
    }
  }, [state?.publicJoinUrl]);

  const updateLink = useCallback(async (action: () => Promise<PublicJoinState>, success: string, fallback: string) => {
    setBusy(true);
    try {
      const next = await action();
      queryClient.setQueryData(qk.clan.publicJoin(clanId), next);
      toast.success(success);
    } catch (e) {
      toast.error(extractApiErrorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  }, [clanId, queryClient]);

  const generate = useCallback(
    () => updateLink(
      () => clanApi.generatePublicJoinLink(clanId, windowPayload()),
      'Public joining link is ready',
      'Could not generate link',
    ),
    [clanId, updateLink, windowPayload],
  );

  // Same endpoint as generate: idempotent enable + apply window without minting a new slug.
  const saveJoinWindow = useCallback(
    () => updateLink(
      () => clanApi.generatePublicJoinLink(clanId, windowPayload()),
      'Join window saved',
      'Could not save join window',
    ),
    [clanId, updateLink, windowPayload],
  );

  const disable = useCallback(
    () => updateLink(() => clanApi.disablePublicJoinLink(clanId), 'Public joining link disabled', 'Could not disable link'),
    [clanId, updateLink],
  );

  const regenerate = useCallback(async () => {
    if (!(await confirm({
      title: 'Regenerate joining link?',
      description: 'The previously shared link will stop working immediately. Existing join requests and members are not affected.',
      confirmLabel: 'Regenerate',
      variant: 'danger',
    }))) return;
    await updateLink(
      () => clanApi.regeneratePublicJoinLink(clanId, windowPayload()),
      'New joining link generated',
      'Could not regenerate link',
    );
  }, [clanId, confirm, updateLink, windowPayload]);

  const decide = useCallback(async (
    requestId: string,
    action: () => Promise<unknown>,
    success: string,
    fallback: string,
  ) => {
    setActingId(requestId);
    const previous = queryClient.getQueryData<ClanJoinRequestRow[]>(requestsKey);
    queryClient.setQueryData<ClanJoinRequestRow[]>(
      requestsKey,
      (prev: ClanJoinRequestRow[] | undefined) => (prev ?? []).filter((r) => r.id !== requestId)
    );
    try {
      await action();
      toast.success(success);
      await invalidate(requestsKey, qk.admin.clans, qk.clan.detail(clanId));
      return true;
    } catch (e) {
      queryClient.setQueryData(requestsKey, previous);
      toast.error(extractApiErrorMessage(e, fallback));
      return false;
    } finally {
      setActingId(null);
    }
  }, [clanId, invalidate, queryClient, requestsKey]);

  const approve = useCallback(
    (requestId: string) => decide(
      requestId,
      () => clanApi.approveJoinRequest(clanId, requestId),
      'Join request approved',
      'Could not approve',
    ),
    [clanId, decide],
  );

  const reject = useCallback((requestId: string, note?: string) => {
    const trimmed = note?.trim();
    return decide(
      requestId,
      () => clanApi.rejectJoinRequest(clanId, requestId, trimmed || undefined),
      'Join request rejected',
      'Could not reject',
    );
  }, [clanId, decide]);

  return {
    state,
    requests,
    pendingCount: requests.length,
    loading: stateLoading || requestsLoading,
    busy,
    actingId,
    windowDraft,
    setWindowDraft,
    copyLink,
    generate,
    saveJoinWindow,
    disable,
    regenerate,
    approve,
    reject,
  };
}
