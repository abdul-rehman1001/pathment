'use client';

import { CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import type { PerformanceNomination } from '@/lib/services/top-performers-api';

/**
 * How far the mentor's judgement and the record agree.
 *
 * This is the whole reason both are stored. An admin cannot read twenty
 * nominations closely, but they can read three: this marks which three. A
 * mentor picking the person the data also ranks first needs no second look; a
 * mentor picking somebody the data puts near the bottom may be seeing something
 * real that no metric holds — or may not — and that is exactly the one to open.
 *
 * Deliberately not a score. It points; it does not judge.
 */
export function AgreementBadge({ nomination }: { nomination: PerformanceNomination }) {
  const { systemRank: rank, systemOutOf: outOf } = nomination;

  if (!rank || !outOf) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        <HelpCircle className="w-3.5 h-3.5" /> No ranking recorded
      </span>
    );
  }

  // Top third: the data says the same thing the mentor did.
  if (rank <= Math.max(1, Math.ceil(outOf / 3))) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="w-3.5 h-3.5" /> Data agrees · ranked {rank} of {outOf}
      </span>
    );
  }

  // Bottom half: worth reading the reasoning properly before deciding.
  if (rank > outOf / 2) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
        <AlertTriangle className="w-3.5 h-3.5" /> Mentor sees more than the data · ranked {rank} of {outOf}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      Ranked {rank} of {outOf}
    </span>
  );
}

/** The numbers behind a placing, in one readable strip. */
export function SignalStrip({ signals }: { signals: PerformanceNomination['systemSignals'] }) {
  if (!signals) return null;
  const items = [
    { label: 'tasks done', value: signals.tasksTotal != null ? `${signals.tasksCompleted}/${signals.tasksTotal}` : String(signals.tasksCompleted) },
    { label: 'roadmap', value: `${signals.completionRate}%` },
    { label: 'on time', value: `${signals.onTimeRate}%` },
    signals.avgRating != null ? { label: 'rating', value: `${signals.avgRating}/5` } : null,
    signals.attendancePct != null && signals.attendancePct >= 0 && signals.attendancePct <= 100
      ? { label: 'attendance', value: `${signals.attendancePct}%` }
      : null,
    { label: 'open blockers', value: signals.openBlockers != null ? String(signals.openBlockers) : '—' },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {items.map((item) => (
        <span key={item.label}>
          <span className="font-medium text-foreground tabular-nums">{item.value}</span> {item.label}
        </span>
      ))}
    </div>
  );
}
