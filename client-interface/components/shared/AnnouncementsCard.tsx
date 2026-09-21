"use client";

import Link from "next/link";
import { Megaphone, Pin, ArrowRight } from "lucide-react";
import { useAnnouncements } from "@/lib/hooks/shared/useAnnouncements";

/** Compact "Latest announcements" card for dashboards. Links to the full feed. */
export function AnnouncementsCard({
  href,
  limit = 3,
}: {
  href: string;
  limit?: number;
  mentor?: boolean;
}) {
  const { announcements, loading } = useAnnouncements();
  if (loading || announcements.length === 0) return null;
  const items = announcements.slice(0, limit);

  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-muted p-3 text-brand-600 dark:text-brand-300">
            <Megaphone className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">From your community</h2>
            <p className="text-xs text-muted-foreground mt-1">
              The latest announcements, in one place.
            </p>
          </div>
        </div>
        <Link
          href={href}
          className="text-sm font-medium text-brand-700 dark:text-brand-300 whitespace-nowrap"
        >
          View all →
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((a) => (
          <Link
            key={a.id}
            href={href}
            className="group rounded-2xl border border-border p-5 transition-colors hover:border-brand-300 hover:bg-muted/40"
          >
            <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {a.pinned && (
                <span className="inline-flex items-center gap-1 text-brand-700 dark:text-brand-300">
                  <Pin className="h-3 w-3" />
                  Pinned ·
                </span>
              )}
              <span>{a.audienceLabel}</span>
            </div>
            <h3 className="font-semibold text-foreground leading-snug">
              {a.title}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed line-clamp-3">
              {a.body}
            </p>
            <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground">
              <span>{a.author?.name || "Community update"}</span>
              <ArrowRight className="h-4 w-4 text-brand-600 dark:text-brand-300" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
