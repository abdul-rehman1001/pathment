'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PackageOpen, X, Wrench, ArrowUpCircle, Rocket, ChevronRight, ChevronDown } from 'lucide-react';
import { type ChangelogEntry } from '@/lib/services/changelog-api';
import { useChangelogFeed } from '@/lib/hooks/shared/useChangelogFeed';

interface ChangelogDrawerProps {
  role: string;
}

// Per-type chip + icon so an entry's nature reads at a glance.
const TYPE_META: Record<string, { label: string; Icon: typeof PackageOpen; chip: string; tint: string }> = {
  feature: { label: 'New', Icon: Rocket, chip: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300', tint: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300' },
  improvement: { label: 'Improved', Icon: ArrowUpCircle, chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', tint: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' },
  fix: { label: 'Fixed', Icon: Wrench, chip: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300', tint: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300' },
};
const meta = (t?: string) => TYPE_META[t || 'feature'] || TYPE_META.feature;

function formatDate(dateString: string | null) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function EntryRow({ entry }: { entry: ChangelogEntry }) {
  const { Icon, tint, chip, label } = meta(entry.type);
  return (
    <div className="px-4 py-4">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tint}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${chip}`}>{label}</span>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.title}</p>
            {entry.unread && <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0" />}
          </div>
          <div
            className="prose prose-sm dark:prose-invert max-w-none mt-1.5 text-slate-600 dark:text-slate-300"
            dangerouslySetInnerHTML={{ __html: entry.body }}
          />
          <div className="mt-2 flex items-center gap-2">
            <p className="text-xs text-slate-400">{formatDate(entry.publishedAt)}</p>
            {entry.actionUrl && (
              <a
                href={entry.actionUrl}
                className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                {entry.actionLabel || 'Learn more'} <ChevronRight className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChangelogDrawer({ role }: ChangelogDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [render, setRender] = useState(false); // in the DOM (true while animating out)
  const [shown, setShown] = useState(false);   // visual open state (drives the slide)
  const [isMounted, setIsMounted] = useState(false);
  const [showFixes, setShowFixes] = useState(false);

  // Shared with ChangelogMount — the modal marking seen clears this badge through
  // the cache, so no cross-component event is needed.
  const { feed, loading: isLoading, markSeen } = useChangelogFeed(role);
  const updates: ChangelogEntry[] = feed.updates;
  const unreadCount = feed.unreadCount;

  useEffect(() => { setIsMounted(true); }, []);

  // Opening the drawer = the user has seen what's new → clear badge + persist.
  const open = () => {
    setIsOpen(true);
    if (unreadCount > 0) markSeen();
  };

  // Drive the enter/exit animation off `isOpen`: mount → next frame slide in;
  // close → slide out, then unmount after the transition (250ms).
  useEffect(() => {
    if (isOpen) {
      setRender(true);
      let r2 = 0;
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setShown(true)); });
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
    }
    setShown(false);
    const t = setTimeout(() => setRender(false), 250);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Escape + scroll-lock while the sheet is on screen.
  useEffect(() => {
    if (!render) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [render]);

  const highlights = updates.filter((u) => u.type !== 'fix');
  const fixes = updates.filter((u) => u.type === 'fix');

  return (
    <>
      <button
        onClick={open}
        className={`relative p-2 rounded-xl transition-colors duration-200 ${
          isOpen ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
        }`}
        aria-label={`What's new ${unreadCount > 0 ? `(${unreadCount} new)` : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="What's new"
      >
        <span className="relative shrink-0">
          <PackageOpen className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 flex items-center justify-center min-w-5 h-5 px-1 bg-red-500 text-white text-xs font-bold rounded-full">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
      </button>

      {isMounted && render && createPortal(
        <>
          <div
            className={`fixed inset-0 z-70 bg-black/30 dark:bg-black/60 lg:left-64 transition-opacity duration-[250ms] ${shown ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <aside
            className={`fixed right-0 top-0 z-80 h-dvh w-full max-w-md bg-card shadow-2xl border-l border-slate-200 dark:border-slate-700 flex flex-col transition-transform duration-[250ms] ease-out will-change-transform ${shown ? 'translate-x-0' : 'translate-x-full'}`}
            role="dialog"
            aria-labelledby="changelog-title"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <PackageOpen className="w-5 h-5 text-brand-600" />
                <div>
                  <h2 id="changelog-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">What's new</h2>
                  <p className="text-sm text-slate-500">Latest features &amp; fixes</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">Loading…</div>
              ) : updates.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2 px-6 text-center">
                  <PackageOpen className="w-8 h-8 text-slate-300" />
                  <span>Nothing new yet — check back soon.</span>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {highlights.map((e) => <EntryRow key={e.id} entry={e} />)}
                  </div>
                  {fixes.length > 0 && (
                    <div className="border-t border-slate-200 dark:border-slate-700">
                      <button
                        onClick={() => setShowFixes((v) => !v)}
                        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span>Also fixed ({fixes.length})</span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${showFixes ? 'rotate-180' : ''}`} />
                      </button>
                      {showFixes && (
                        <div className="divide-y divide-slate-100 dark:divide-slate-700">
                          {fixes.map((e) => <EntryRow key={e.id} entry={e} />)}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </>,
        document.body
      )}
    </>
  );
}

export { ChangelogDrawer };
