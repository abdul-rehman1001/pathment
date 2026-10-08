'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { qk, useApiQuery } from '@/lib/query';
import { aiConnectionsApi, type AIConnection, type AIRouting, type AIFeature, type AIProvider } from '@/lib/services/ai-connections-api';

const EMPTY_ROUTING: AIRouting = {
  summary: null, delay: null, atrisk: null, nudge: null, stall: null, coaching: null, feedback: null,
  roadmap: null, rag_generation: null, rag_grounding: null, rag_embedding: null, certificates: null,
};

type RouteFeature = Exclude<AIFeature, 'auto_reply'>;
const ROUTE_FEATURES = Object.keys(EMPTY_ROUTING) as RouteFeature[];

/** Full routing map as returned/stored by the API (may include server-only keys e.g. assessment). */
type RoutingMap = AIRouting & Record<string, string | null | undefined>;

/**
 * Apply one connection to every UI-managed feature.
 * - Starts from `prev` so server-only routes (e.g. assessment) are preserved.
 * - rag_embedding stays Gemini-only (left unchanged for other providers).
 */
export function buildAllRouting(
  connectionId: string | null,
  provider: AIProvider | undefined,
  prev: RoutingMap = EMPTY_ROUTING,
): RoutingMap {
  const next: RoutingMap = { ...prev };
  for (const feature of ROUTE_FEATURES) {
    if (feature === 'rag_embedding') {
      next[feature] = !connectionId
        ? null
        : provider === 'gemini'
          ? connectionId
          : (prev.rag_embedding ?? null);
      continue;
    }
    next[feature] = connectionId;
  }
  return next;
}

interface ConnectionsData {
  connections: AIConnection[];
  routing: RoutingMap;
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

  const persistRouting = useCallback(async (next: RoutingMap) => {
    client.setQueryData<ConnectionsData>(qk.admin.aiConnections, (prev) => prev && { ...prev, routing: next });
    try { await aiConnectionsApi.setRouting(next); }
    catch { toast.error('Could not update routing'); refetch(); throw new Error('routing_failed'); }
  }, [client, refetch]);

  const addKey = useCallback(async (
    payload: { provider: AIProvider; label: string; model?: string; baseUrl?: string; key: string },
    opts?: { applyToAll?: boolean },
  ) => {
    try {
      const res: any = await aiConnectionsApi.create(payload); // eslint-disable-line @typescript-eslint/no-explicit-any
      const created: AIConnection | undefined = res?.data?.connection;
      if (opts?.applyToAll && created?.id) {
        await persistRouting(buildAllRouting(created.id, created.provider || payload.provider, routing));
        toast.success('Connection added and applied to all features');
      } else {
        toast.success('Connection added');
      }
      await refetch();
      return true;
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (e?.message === 'routing_failed') { await refetch(); return true; }
      toast.error(e?.response?.data?.message || 'Could not add connection');
      return false;
    }
  }, [refetch, persistRouting, routing]);

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
    try { await persistRouting({ ...routing, [feature]: connectionId }); }
    catch { /* toast + refetch in persistRouting */ }
  }, [routing, persistRouting]);

  const setAllRoutes = useCallback(async (connectionId: string | null) => {
    const provider = connections.find((c) => c.id === connectionId)?.provider;
    try {
      await persistRouting(buildAllRouting(connectionId, provider, routing));
      toast.success(connectionId ? 'Applied to all features' : 'Feature routing cleared');
      if (connectionId && provider && provider !== 'gemini') {
        toast.message('RAG Vectors left unchanged Gemini only');
      }
    } catch { /* toast + refetch in persistRouting */ }
  }, [connections, routing, persistRouting]);

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

  return { connections, routing, quota, loading, busyId, refetch, addKey, removeKey, testKey, setRoute, setAllRoutes, setQuotaLimit };
}

export function useAIQuota() {
  const { quota, loading, setQuotaLimit, refetch } = useAIConnections();
  return { quota, loading, setQuotaLimit, refetch };
}
