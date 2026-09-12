'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from './client';

/**
 * One QueryClient per browser session, created in state so it survives re-renders
 * but is never shared between users on the server.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState<QueryClient>(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
