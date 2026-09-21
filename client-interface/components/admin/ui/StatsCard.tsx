import React from 'react';

interface StatsCardProps {
  /** Lucide icon component */
  icon: React.ElementType;
  label: string;
  value: string | number;
  /** Optional small sub-text below the value */
  sub?: string;
  /**
   * Tailwind classes for the icon container background + icon colour.
   * e.g. 'text-brand-600 bg-brand-50'  (default)
   */
  colorClass?: string;
}

export function StatsCard({
  icon: Icon,
  label,
  value,
  sub,
  colorClass = 'text-brand-600 bg-brand-50',
}: StatsCardProps) {
  return (
    <div className="h-full rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className={`shrink-0 rounded-lg p-2 ${colorClass}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-5 text-muted-foreground">{label}</p>
          <p className="mt-1 break-words text-2xl font-semibold leading-8 tracking-tight text-foreground tabular-nums">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {sub && <p className="mt-1 text-xs leading-4 text-muted-foreground">{sub}</p>}
        </div>
      </div>
    </div>
  );
}
