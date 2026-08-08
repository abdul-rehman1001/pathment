'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';

interface MobileReviewActionBarProps {
  currentIndex: number;
  totalCount: number;
  onPrev: () => void;
  onSkip: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}

/**
 * Mobile-only sticky bottom bar for quick clan review navigation.
 * Renders only on screens < lg breakpoint (<1024px).
 */
export function MobileReviewActionBar({
  currentIndex,
  totalCount,
  onPrev,
  onSkip,
  onNext,
  canPrev,
  canNext,
}: MobileReviewActionBarProps) {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 p-3 shadow-lg flex items-center justify-between gap-2">
      <button
        onClick={onPrev}
        disabled={!canPrev}
        className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1 shrink-0"
      >
        <ChevronLeft className="w-4 h-4" />
        Prev
      </button>

      <div className="text-center text-xs font-medium text-slate-600 truncate px-1">
        {currentIndex + 1} of {totalCount}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onSkip}
          className="px-3 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 flex items-center gap-1"
        >
          <SkipForward className="w-3.5 h-3.5" />
          Skip
        </button>

        <button
          onClick={onNext}
          disabled={!canNext}
          className="px-3.5 py-2 rounded-xl bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 disabled:opacity-40 flex items-center gap-1 shadow-sm"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
