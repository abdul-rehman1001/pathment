'use client';

import { useEffect, useState } from 'react';
import { runDomainHandoff, HandoffAccountConflictError } from '@/lib/services/domain-handoff';
import { workspacePath } from '@/lib/services/workspace-scope';

export default function SessionHandoffPage() {
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    runDomainHandoff().catch((failure) => {
      if (active) setError(failure instanceof HandoffAccountConflictError ? failure.message : 'Unable to transfer this session. Return to your original workspace and retry, or sign in here. Your existing session is preserved.');
    });
    return () => { active = false; };
  }, []);

  const login = workspacePath('/login');
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6 dark:bg-slate-950">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {!error ? (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Opening your workspace</h1>
            <p className="mt-2 text-sm text-slate-500">Securely transferring your existing session…</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Sign in to continue</h1>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
            <a className="mt-6 inline-flex rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700" href={login}>Go to sign in</a>
          </>
        )}
      </section>
    </main>
  );
}
