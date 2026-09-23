'use client';

import { useEffect, useState } from 'react';
import { runDomainHandoff } from '@/lib/services/domain-handoff';
import { legacyWorkspaceFromHostname } from '@/lib/services/workspace-scope';

export function LegacyDomainHandoff() {
  const [moving, setMoving] = useState(false);

  const [error, setError] = useState('');
  useEffect(() => {
    if (!legacyWorkspaceFromHostname(window.location.hostname)) return;
    let active = true;
    const reveal = window.setTimeout(() => setMoving(true), 0);
    runDomainHandoff().catch(() => {
      if (active) setError('Transfer failed. Your existing session is preserved. Reload to try again.');
    });
    return () => { active = false; window.clearTimeout(reveal); };
  }, []);

  if (!moving) return null;
  return (
    <div className="fixed inset-0 z-[10000] grid place-items-center bg-white/95 px-6 dark:bg-slate-950/95">
      <div className="text-center">
        <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
        <p className="font-semibold text-slate-900 dark:text-white">Moving you to your Pathment workspace…</p>
        <p className="mt-1 text-sm text-slate-500">{error || 'Your account and work stay exactly as they are.'}</p>
      </div>
    </div>
  );
}
