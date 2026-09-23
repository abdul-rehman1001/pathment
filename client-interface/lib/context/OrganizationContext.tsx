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

  const value = useMemo<OrganizationContextValue>(() => ({
    current: overview?.organization || null,
    organizations: overview?.organizations || [],
    overview,
    loading,
    refresh,
    switchTo: switchWorkspace,
  }), [overview, loading, refresh]);

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization() {
  const value = useContext(OrganizationContext);
  if (!value) throw new Error('useOrganization must be used within OrganizationProvider');
  return value;
}
