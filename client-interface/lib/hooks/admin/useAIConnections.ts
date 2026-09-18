'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { qk, useApiQuery } from '@/lib/query';
import { aiConnectionsApi, type AIConnection, type AIRouting, type AIFeature, type AIProvider } from '@/lib/services/ai-connections-api';

const EMPTY_ROUTING: AIRouting = { summary: null, delay: null, atrisk: null, nudge: null, stall: null, coaching: null, feedback: null, roadmap: null, rag_generation: null, rag_grounding: null, rag_embedding: null };

interface ConnectionsData {
  connections: AIConnection[];
  routing: AIRouting;
  quota: { count: number; limit: number } | null;
}

const EMPTY: ConnectionsData = { connections: [], routing: EMPTY_ROUTING, quota: null };

export function useAIConnections() {
  const client = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, loading, refetch } = useApiQuery<ConnectionsData>({
    queryKey: qk.admin.aiConnections,
    queryFn: async () => {
      const res: any = await aiConnectionsApi.list(); // eslint-disable-line @typescript-eslint/no-explicit-any
      return {
        connections: res?.data?.connections ?? [],
        routing: { ...EMPTY_ROUTING, ...(res?.data?.routing ?? {}) },
        quota: res?.data?.quota ?? null,
      };
    },
    errorMessage: 'Failed to load AI connections',
  });

  const { connections, routing, quota } = data ?? EMPTY;

  const addKey = useCallback(async (payload: { provider: AIProvider; label: string; model?: string; baseUrl?: string; key: string }) => {
    try { await aiConnectionsApi.create(payload); toast.success('Connection added'); await refetch(); return true; }
    catch (e: any) { toast.error(e?.response?.data?.message || 'Could not add connection'); return false; } // eslint-disable-line @typescript-eslint/no-explicit-any
  }, [refetch]);

  const removeKey = useCallback(async (id: string) => {
    try { setBusyId(id); await aiConnectionsApi.remove(id); toast.success('Connection removed'); await refetch(); }
    catch { toast.error('Could not remove'); } finally { setBusyId(null); }
  }, [refetch]);

  const testKey = useCallback(async (id: string) => {
    try {
      setBusyId(id);
      const res: any = await aiConnectionsApi.test(id); // eslint-disable-line @typescript-eslint/no-explicit-any
      const status = res?.data?.status;
      toast[status === 'connected' ? 'success' : 'error'](status === 'connected' ? 'Connection works' : 'Connection failed');
      await refetch();
    } catch { toast.error('Test failed'); } finally { setBusyId(null); }
  }, [refetch]);

  const setRoute = useCallback(async (feature: AIFeature, connectionId: string | null) => {
    const next = { ...routing, [feature]: connectionId };
    // Optimistic: write straight to the cache so the select updates instantly.
    client.setQueryData<ConnectionsData>(qk.admin.aiConnections, (prev) => prev && { ...prev, routing: next });
    try { await aiConnectionsApi.setRouting(next); }
    catch { toast.error('Could not update routing'); refetch(); }
  }, [routing, client, refetch]);

  const setQuotaLimit = useCallback(async (limit: number) => {
    try {
      const res: any = await aiConnectionsApi.setQuotaLimit(limit); // eslint-disable-line @typescript-eslint/no-explicit-any
      client.setQueryData<ConnectionsData>(qk.admin.aiConnections, (prev) => prev && { ...prev, quota: res?.data?.quota ?? null });
      toast.success('Quota limit updated');
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      toast.error(e?.response?.data?.message || 'Could not update quota limit');
      refetch();
    }
  }, [client, refetch]);

  return { connections, routing, quota, loading, busyId, refetch, addKey, removeKey, testKey, setRoute, setQuotaLimit };
}
