'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

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

/** Lead-mentor public joining link, join window, and pending request decisions. */
export function useClanPublicJoin(clanId: string): UseClanPublicJoinReturn {
  const confirm = useConfirm();
  const [state, setState] = useState<PublicJoinState | null>(null);
  const [requests, setRequests] = useState<ClanJoinRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [windowDraft, setWindowDraftState] = useState<PublicJoinWindowDraft>({
    startsDate: '',
    startsTime: '',
    endsDate: '',
    endsTime: '',
  });

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

  const applyState = useCallback((next: PublicJoinState) => {
    setState(next);
    const starts = splitLocal(next.publicJoinStartsAt);
    const ends = splitLocal(next.publicJoinEndsAt);
    setWindowDraftState({
      startsDate: starts.date,
      startsTime: starts.time,
      endsDate: ends.date,
      endsTime: ends.time,
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [joinState, pending] = await Promise.all([
        clanApi.getPublicJoinState(clanId),
        clanApi.listJoinRequests(clanId, 'pending').catch(() => []),
      ]);
      applyState(joinState);
      setRequests(pending);
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not load public joining settings'));
      setState(null);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [clanId, applyState]);

  useEffect(() => { load(); }, [load]);

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
      applyState(await action());
      toast.success(success);
    } catch (e) {
      toast.error(extractApiErrorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  }, [applyState]);

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

  const approve = useCallback(async (requestId: string) => {
    setActingId(requestId);
    const previous = requests;
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
    try {
      await clanApi.approveJoinRequest(clanId, requestId);
      toast.success('Join request approved');
      return true;
    } catch (e) {
      setRequests(previous);
      toast.error(extractApiErrorMessage(e, 'Could not approve'));
      return false;
    } finally {
      setActingId(null);
    }
  }, [clanId, requests]);

  const reject = useCallback(async (requestId: string, note?: string) => {
    setActingId(requestId);
    const previous = requests;
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
    try {
      const trimmed = note?.trim();
      await clanApi.rejectJoinRequest(clanId, requestId, trimmed || undefined);
      toast.success('Join request rejected');
      return true;
    } catch (e) {
      setRequests(previous);
      toast.error(extractApiErrorMessage(e, 'Could not reject'));
      return false;
    } finally {
      setActingId(null);
    }
  }, [clanId, requests]);

  return {
    state,
    requests,
    pendingCount: requests.length,
    loading,
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
