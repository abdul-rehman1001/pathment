'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PackageOpen, X } from 'lucide-react';
import { type ChangelogEntry } from '@/lib/services/changelog-api';
import { useChangelogFeed } from '@/lib/hooks/shared/useChangelogFeed';

interface ChangelogMountProps {
  role: string;
}

/**
 * Mounted once per portal layout. On load it checks for unseen `isMajor` updates
 * and, if any, pops a one-time "What's new" modal. Dismissing marks the whole
 * feed seen (so the sidebar badge clears too, via the shared event).
 */
export default function ChangelogMount({ role }: ChangelogMountProps) {
  const { feed, markSeen } = useChangelogFeed(role);
  // Snapshot on open: marking seen empties majorUnseen, and the modal must stay
  // rendered through its exit animation.
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [shown, setShown] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Fade + scale in once opened.
  useEffect(() => {
    if (!open) { setShown(false); return; }
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, [open]);

  useEffect(() => {
    if (dismissed || open || !feed.majorUnseen?.length) return;
    setEntries(feed.majorUnseen);
    setOpen(true);
  }, [feed.majorUnseen, dismissed, open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dismiss = () => {
    setShown(false);
    setDismissed(true);
    markSeen();
    setTimeout(() => setOpen(false), 200);
  };

  if (!mounted || !open || entries.length === 0) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={dismiss}
        aria-hidden="true"
      />
      <div
        className={`relative w-full max-w-lg bg-card rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden transition-all duration-200 ease-out ${shown ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsnew-title"
      >
        <div className="bg-gradient-to-br from-brand-500 to-brand-700 px-6 py-7 text-white relative">
          <button onClick={dismiss} className="absolute top-3 right-3 p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
          <PackageOpen className="w-7 h-7 mb-2" />
          <h2 id="whatsnew-title" className="text-xl font-bold">What's new in Pathment</h2>
          <p className="text-white/80 text-sm mt-1">{entries.length === 1 ? "Here's the latest update" : `${entries.length} updates since you were last here`}</p>
        </div>

        <div className="max-h-[55vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
          {entries.map((e) => (
            <div key={e.id} className="px-6 py-4">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{e.title}</p>
              <div
                className="prose prose-sm dark:prose-invert max-w-none mt-1 text-slate-600 dark:text-slate-300"
                dangerouslySetInnerHTML={{ __html: e.body }}
              />
              {e.actionUrl && (
                <a href={e.actionUrl} onClick={dismiss} className="inline-block mt-2 text-sm font-medium text-brand-600 hover:text-brand-700">
                  {e.actionLabel || 'Check it out'} →
                </a>
              )}
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button onClick={dismiss} className="px-5 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-colors">
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export { ChangelogMount };
