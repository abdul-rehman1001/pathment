'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { organizationsApi, type OrganizationOverview, type OrganizationSummary } from '@/lib/services/organizations-api';
import { switchWorkspace } from '@/lib/services/workspace-scope';

interface OrganizationContextValue {
  current: OrganizationSummary | null;
  organizations: OrganizationSummary[];
  overview: OrganizationOverview | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Instant logo update in current + membership list (avoids a full refetch). */
  patchLogo: (logoUrl: string | null) => void;
  switchTo: (slug: string) => void;
}

const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [overview, setOverview] = useState<OrganizationOverview | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) { setOverview(null); return; }
    setLoading(true);
    try { setOverview(await organizationsApi.current()); }
    catch { setOverview(null); }
    finally { setLoading(false); }
  }, [isAuthenticated]);

  useEffect(() => { void refresh(); }, [refresh, user?.id]);

  const patchLogo = useCallback((logoUrl: string | null) => {
    setOverview((prev) => {
      if (!prev?.organization) return prev;
      const organization = { ...prev.organization, logoUrl };
      return {
        ...prev,
        organization,
        organizations: prev.organizations.map((row) =>
          row.id === organization.id ? { ...row, logoUrl } : row,
        ),
      };
    });
  }, []);

  const value = useMemo<OrganizationContextValue>(() => ({
    current: overview?.organization || null,
    organizations: overview?.organizations || [],
    overview,
    loading,
    refresh,
    patchLogo,
    switchTo: switchWorkspace,
  }), [overview, loading, refresh, patchLogo]);

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  const value = useContext(OrganizationContext);
  if (!value) throw new Error('useOrganization must be used within OrganizationProvider');
  return value;
}
