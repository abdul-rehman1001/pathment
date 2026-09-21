import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function MetricTile({
  label,
  value,
  icon: Icon,
  tone,
  hint,
  compact = false,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone: 0 | 1 | 2 | 3;
  hint: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`mentor-stat mentor-stat-${tone} relative isolate overflow-hidden rounded-2xl ${compact ? "p-4" : "p-5"} h-full`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="rounded-xl bg-muted p-2">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p
        className={`${compact ? "my-1 text-3xl" : "my-3 text-4xl"} font-semibold tracking-tight tabular-nums`}
      >
        {value}
      </p>
      <span className="block border-t pt-3 text-xs leading-relaxed">
        {hint}
      </span>
    </div>
  );
}
