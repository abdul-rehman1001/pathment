"use client";

import React, { useEffect, useState, useCallback } from "react";
import { X, Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/context/AuthContext";
import { logicalPathname, workspacePath } from "@/lib/services/workspace-scope";
import {
  gamificationApi,
  type PointsHistoryEntry,
} from "@/lib/services/gamification-api";

function formatReason(item: PointsHistoryEntry): string {
  if (item.reason && item.reason.trim()) {
    return item.reason.trim();
  }
  const typeMap: Record<string, string> = {
    daily_login: "Daily Login Check-in",
    task_completion: "Task Completed",
    task_approved: "Task Approved",
    review_contribution: "Cohort Review Contribution",
    community_kudos: "Received Kudos",
    community_answer: "Accepted Answer",
    quiz_passed: "Quiz Passed",
    interview_completed: "Interview Completed",
    streak_bonus: "Streak Bonus",
    badge_reward: "Badge Unlocked",
  };
  return typeMap[item.sourceType] || "Activity Milestone";
}

export function PointsEarnedNotifier() {
  const { user } = useAuth();
  const pathname = logicalPathname(usePathname());
  const [items, setItems] = useState<PointsHistoryEntry[]>([]);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    setItems([]);
    setVisible(false);
    setDismissed(false);
  }, [user?.id]);

  const checkUnseenPoints = useCallback(async () => {
    if (!user || !user.id || dismissed) return;

    const cacheKey = `pathment_seen_point_ids_${user.id}`;
    let seenIds: string[] = [];
    try {
      const stored = JSON.parse(localStorage.getItem(cacheKey) || "[]");
      seenIds = Array.isArray(stored)
        ? stored.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      seenIds = [];
    }

    try {
      const history = await gamificationApi.getUserPointsHistory(user.id, 10);
      const unseen = (history || []).filter(
        (item) => Number(item.pointsChange) > 0 && !seenIds.includes(item.id),
      );

      if (unseen.length > 0) {
        setItems(unseen);

        setVisible(true);
      }
    } catch {
      // Silently ignore points fetch errors
    }
  }, [user, dismissed]);

  useEffect(() => {
    if (user?.id) {
      const timer = setTimeout(() => {
        checkUnseenPoints();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [user?.id, checkUnseenPoints]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setDismissed(true);

    if (!user?.id || items.length === 0) return;

    const cacheKey = `pathment_seen_point_ids_${user.id}`;
    try {
      const existing: string[] = JSON.parse(
        localStorage.getItem(cacheKey) || "[]",
      );
      const newIds = items.map((i) => i.id);
      const updated = Array.from(new Set([...existing, ...newIds]));
      localStorage.setItem(cacheKey, JSON.stringify(updated.slice(-100)));
    } catch {
      // Ignore storage errors
    }
  }, [user?.id, items]);

  useEffect(() => {
    if (visible && !paused) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [visible, paused, handleDismiss]);

  if (!visible || items.length === 0) return null;

  const totalPoints = items.reduce(
    (sum, item) => sum + Number(item.pointsChange || 0),
    0,
  );
  const primaryItem = items[0];

  const dailyLogin =
    items.length === 1 && primaryItem.sourceType === "daily_login";
  const rewardsHref = pathname.startsWith("/mentee")
    ? "/mentee/gamification"
    : null;

  return (
    <aside
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setPaused(false);
      }}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-5 left-4 right-4 sm:right-auto lg:left-72 z-50 sm:w-96 rounded-2xl border border-border bg-card p-4 text-foreground shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {dailyLogin
              ? "A little progress, every day"
              : items.length > 1
                ? `${items.length} rewards earned`
                : formatReason(primaryItem)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              +{totalPoints} {totalPoints === 1 ? "point" : "points"}
            </span>
            {dailyLogin
              ? " for checking in today."
              : items.length > 1
                ? " from your recent activity."
                : " added to your progress."}
          </p>
          {rewardsHref && (
            <Link
              href={workspacePath(rewardsHref)}
              onClick={handleDismiss}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 dark:text-brand-300"
            >
              View rewards{" "}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-brand-500"
          aria-label="Dismiss reward notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
