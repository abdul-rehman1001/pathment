'use client';

import { useCallback } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { accessApi } from '@/lib/services/access-api';
import { qk, useApiQuery, STALE } from '@/lib/query';
import type { Permission } from '@/lib/config/permissions';

interface PermState { permissions: string[]; canAccessAdmin: boolean }

const EMPTY: PermState = { permissions: [], canAccessAdmin: false };

/**
 * The current user's permission UNION (across all scopes) + a `canAccessAdmin`
 * flag, for showing/hiding UI. The server still enforces per-request — this is
 * UX only.
 *
 * Cached per user: five components call this on every page and share one fetch.
 */
export function usePermissions() {
  const { user } = useAuth();

  const { data, loading } = useApiQuery<PermState>({
    queryKey: [...qk.auth.permissions, user?.id ?? 'anon'],
    queryFn: () => accessApi.myPermissions(),
    enabled: !!user,
    staleTime: STALE.long,
    errorMessage: 'Failed to load permissions',
  });

  const state = user ? (data ?? EMPTY) : EMPTY;

  const can = useCallback((perm: Permission | string) => state.permissions.includes(perm), [state.permissions]);
  const canAny = useCallback(
    (perms: (Permission | string)[]) => perms.some((p) => state.permissions.includes(p)),
    [state.permissions]
  );

  return {
    permissions: state.permissions,
    canAccessAdmin: state.canAccessAdmin,
    can,
    canAny,
    loading: !!user && loading,
  };
}

/** Convenience: just the `can` predicate. */
export function useCan() {
  return usePermissions().can;
}
