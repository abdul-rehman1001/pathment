'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { qk, useApiQuery, useInvalidate } from '@/lib/query';
import { clanApi, type PublicJoinState } from '@/lib/services/clan-api';
import { usePagination } from '@/lib/hooks/shared/usePagination';
import { useDebounce } from '@/lib/hooks/shared/useDebounce';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

export interface ClanMembershipRow {
  id: string;
  userId: string;
  role: 'lead_mentor' | 'co_mentor' | 'mentee' | 'core_team';
  status: string;
  user?: { id: string; firstName: string; lastName: string; email: string; role: string; profilePictureUrl?: string | null };
}

export interface Clan {
  id: string;
  name: string;
  description?: string;
  whatsappGroupLink?: string | null;
  status: string;
  tags: string[];
  levelLabel?: string | null;
  /** Cohort level keys this clan serves (empty = any level). */
  levels?: string[];
  /** Countries this clan serves (empty = any country). */
  countries?: string[];
  maxMentees: number;
  programId: string;
  program?: { id: string; name: string };
  leadMentor?: { id: string; firstName: string; lastName: string } | null;
  memberships?: ClanMembershipRow[];
  /** Active-member counts from the paginated list endpoint. */
  menteeCount?: number;
  mentorCount?: number;
  /** Admin granted public-joining permission (lead may generate a link). */
  publicJoinAllowed?: boolean;
  /** Lead has an enabled public joining link. */
  publicJoinEnabled?: boolean;
}

export interface UseAdminClansReturn {
  clans: Clan[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  pagination: ReturnType<typeof usePagination>;
  search: string;
  setSearch: (v: string) => void;
  programFilter: string;
  setProgramFilter: (v: string) => void;
  selected: Set<string>;
  selectedCount: number;
  allVisibleSelected: boolean;
  bulkBusy: boolean;
  toggleOne: (id: string) => void;
  toggleAllVisible: () => void;
  clearSelected: () => void;
  applyBulkPublicJoinAccess: (allowed: boolean) => Promise<void>;
}

/**
 * Server-side clan list for the admin page: search (name/program/lead-mentor/tag)
 * + program filter + pagination, all enforced (and capped) on the backend so the
 * full table is never shipped to the browser. Grows safely with the org.
 */
interface ClanPage { clans: Clan[]; total: number | null }

const EMPTY: ClanPage = { clans: [], total: null };

export function useAdminClans(): UseAdminClansReturn {
  const invalidate = useInvalidate();
  const pagination = usePagination({ initialPage: 1, initialLimit: 12 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [programFilter, setProgramFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const { data, loading, error, refetch } = useApiQuery<ClanPage>({
    queryKey: qk.admin.clanList(pagination.page, pagination.limit, debouncedSearch.trim(), programFilter),
    queryFn: async () => {
      const res = await clanApi.list({
        page: pagination.page,
        limit: pagination.limit,
        ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
        ...(programFilter && { programId: programFilter }),
      });
      return { clans: res?.data?.clans ?? [], total: res?.data?.total ?? null };
    },
    errorMessage: 'Failed to load clans',
  });

  const clans = data?.clans ?? EMPTY.clans;

  // The page total belongs to the pagination helper, not the query, so it is
  // synced here rather than written from inside queryFn.
  const total = data?.total ?? null;
  useEffect(() => {
    if (typeof total === 'number') pagination.setTotal(total);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  // Any filter change returns to page 1.
  useEffect(() => {
    pagination.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, programFilter]);

  useEffect(() => {
    const visible = new Set(clans.map((c) => c.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [clans]);

  const allVisibleSelected = clans.length > 0 && clans.every((c) => selected.has(c.id));
  const selectedCount = selected.size;

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      clans.forEach((c) => {
        if (allVisibleSelected) next.delete(c.id);
        else next.add(c.id);
      });
      return next;
    });
  }, [allVisibleSelected, clans]);

  const clearSelected = useCallback(() => setSelected(new Set()), []);

  const applyBulkPublicJoinAccess = useCallback(async (allowed: boolean) => {
    if (!selected.size) return;
    setBulkBusy(true);
    try {
      const result = await clanApi.bulkSetPublicJoinAccess({
        clanIds: [...selected],
        allowed,
      });
      toast.success(
        allowed
          ? `Public joining allowed for ${result.updated} clan${result.updated === 1 ? '' : 's'}`
          : `Public joining removed for ${result.updated} clan${result.updated === 1 ? '' : 's'}`
      );
      setSelected(new Set());
      await invalidate(qk.admin.clans, qk.clan.all);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not update public joining access'));
    } finally {
      setBulkBusy(false);
    }
  }, [invalidate, selected]);

  return {
    clans,
    loading,
    error,
    refetch,
    pagination,
    search,
    setSearch,
    programFilter,
    setProgramFilter,
    selected,
    selectedCount,
    allVisibleSelected,
    bulkBusy,
    toggleOne,
    toggleAllVisible,
    clearSelected,
    applyBulkPublicJoinAccess,
  };
}

export interface UseAdminClanPublicJoinReturn {
  publicJoin: PublicJoinState | null;
  publicJoinLoading: boolean;
  publicJoinBusy: boolean;
  loadPublicJoin: () => Promise<PublicJoinState | null>;
  savePublicJoinAccess: (allowed: boolean) => Promise<boolean>;
}

/** Admin drawer: allow/revoke public joining only (lead sets the join window). */
export function useAdminClanPublicJoin(clanId: string): UseAdminClanPublicJoinReturn {
  const invalidate = useInvalidate();
  const queryClient = useQueryClient();
  const [publicJoinBusy, setPublicJoinBusy] = useState(false);

  const { data: publicJoin = null, loading: publicJoinLoading, refetch } = useApiQuery<PublicJoinState | null>({
    queryKey: qk.clan.publicJoin(clanId),
    queryFn: () => clanApi.getPublicJoinState(clanId).catch(() => null),
    enabled: !!clanId,
  });

  const loadPublicJoin = useCallback(async () => {
    await refetch();
    return null;
  }, [refetch]);

  const savePublicJoinAccess = useCallback(async (allowed: boolean) => {
    setPublicJoinBusy(true);
    try {
      const next = await clanApi.setPublicJoinAccess(clanId, { allowed });
      queryClient.setQueryData(qk.clan.publicJoin(clanId), next);
      toast.success(allowed ? 'Public joining access granted' : 'Public joining access removed');
      await invalidate(qk.admin.clans);
      return true;
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not update public joining access'));
      return false;
    } finally {
      setPublicJoinBusy(false);
    }
  }, [clanId, invalidate, queryClient]);

  return {
    publicJoin,
    publicJoinLoading,
    publicJoinBusy,
    loadPublicJoin,
    savePublicJoinAccess,
  };
}
