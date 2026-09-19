'use client';

import { useState } from 'react';
import { useAIConnections } from './useAIConnections';

/**
 * Custom hook wrapping AIConnectionsTab presentation logic:
 * - AI Provider keys list & status checks
 * - Feature routing assignments
 * - Key addition & deletion state
 */
export function useAIConnectionsTab() {
  const { connections, routing, loading, busyId, addKey, removeKey, testKey, setRoute } = useAIConnections();
  const [adding, setAdding] = useState(false);

  return {
    connections,
    routing,
    loading,
    busyId,
    adding,
    setAdding,
    addKey,
    removeKey,
    testKey,
    setRoute,
  };
}
