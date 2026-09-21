"use client";

import { OrganizationCharts } from "@/components/admin/OrganizationCharts";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Users,
  Users2,
  ClipboardCheck,
  Flag,
  ArrowUpRight,
  Loader2,
  Search,
  CheckCircle2,
} from "lucide-react";
import { useClanHealth } from "@/lib/hooks/admin";
import { usePermissions } from "@/lib/hooks/usePermissions";
import { AnnouncementsCard } from "@/components/shared/AnnouncementsCard";
import { Avatar } from "@/components/shared/Avatar";
import { MetricTile } from "@/components/shared/MetricTile";

import {
  filterClanQueue,
  CLAN_PAGE_SIZE as PAGE_SIZE,
  type Queue,
} from "@/lib/utils/admin-clan-queue";

export default function AdminDashboardPage() {
  const { kpis, programs, atRiskMentees, loading, error, refetch, summary } =
    useClanHealth();
  const { can } = usePermissions();
  const [queue, setQueue] = useState<Queue>("attention");
  const [query, setQuery] = useState("");
  const [programId, setProgramId] = useState("");
  const [page, setPage] = useState(1);
  const clans = useMemo(
    () =>
      programs.flatMap((program) =>
        program.clans.map((clan) => ({
          ...clan,
          programName: program.name,
          programId: program.id,
        })),
      ),
    [programs],
  );
  const attention = clans.filter((clan) => clan.status !== "green");
  const pending = clans.reduce((sum, clan) => sum + clan.pendingApprovals, 0);
  const blockers = clans.reduce((sum, clan) => sum + clan.openBlockers, 0);
  const filtered = useMemo(
    () => filterClanQueue(clans, { programId, query, queue }),
    [clans, programId, query, queue],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const selectQueue = (next: Queue) => {
    setQueue(next);
    setPage(1);
  };
  const priorityMentees = [...atRiskMentees]
    .sort(
      (a, b) =>
        Number(b.risk === "high") - Number(a.risk === "high") ||
        a.absoluteProgress - b.absoluteProgress,
    )
    .slice(0, 5);

  if (loading)
    return (
      <div className="flex justify-center py-24" role="status">
        <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
        <span className="sr-only">Loading organization overview</span>
      </div>
    );
  if (error)
    return (
      <div className="admin-page-heading">
        <div>
          <h1>Overview unavailable</h1>
          <p className="mt-2 text-muted-foreground">{error}</p>
        </div>
        <button
          onClick={refetch}
          className="rounded-xl bg-brand-600 px-4 py-2 text-white"
        >
          Try again
        </button>
      </div>
    );

  return (
    <div className="space-y-6">
      <header className="admin-overview-hero flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest mb-2">
            Organization overview
          </p>
          <h1>Focus on what moves things forward</h1>
          <p className="mt-2">
            {kpis?.programs ?? programs.length} program
            {(kpis?.programs ?? programs.length) === 1 ? "" : "s"} ·{" "}
            {kpis?.clans ?? clans.length} clans · {kpis?.avgOnTime ?? 0}%
            on-time delivery
          </p>
        </div>
        {can("intake.manage") && (
          <Link
            href="/admin/cohorts"
            className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-sm font-medium text-white hover:bg-white/20"
          >
            Manage admissions <ArrowUpRight className="h-4 w-4" />
          </Link>
        )}
      </header>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div>
          <MetricTile
            label="Active mentees"
            value={kpis?.activeMentees ?? 0}
            icon={Users}
            tone={0}
            hint={`${kpis?.avgCompletion ?? 0}% average completion`}
            compact
          />
        </div>
        <a href="#clan-queue" onClick={() => selectQueue("attention")}>
          <MetricTile
            label="Clans needing support"
            value={attention.length}
            icon={Users2}
            tone={3}
            hint="Review priority clans →"
            compact
          />
        </a>
        <a href="#clan-queue" onClick={() => selectQueue("reviews")}>
          <MetricTile
            label="Pending approvals"
            value={pending}
            icon={ClipboardCheck}
            tone={1}
            hint="Find the responsible clan →"
            compact
          />
        </a>
        <a href="#clan-queue" onClick={() => selectQueue("blockers")}>
          <MetricTile
            label="Open roadblocks"
            value={blockers}
            icon={Flag}
            tone={2}
            hint="See where support is needed →"
            compact
          />
        </a>
      </div>
      <OrganizationCharts summary={summary} />
      <section
        id="clan-queue"
        className="scroll-mt-6 rounded-3xl border border-border bg-card overflow-hidden"
      >
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h2 className="text-lg">Clan priorities</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Highest concern first. Review a focused list, then open a clan
                to act.
              </p>
            </div>
            {can("clan.create") && (
              <Link
                href="/admin/clans"
                className="text-sm font-medium text-brand-700 dark:text-brand-300"
              >
                Manage all clans →
              </Link>
            )}
          </div>
          <div
            className="flex flex-wrap gap-2"
            aria-label="Clan priority filters"
          >
            {(
              [
                ["attention", "Needs attention"],
                ["reviews", "Pending approvals"],
                ["blockers", "Roadblocks"],
                ["all", "All clans"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                aria-pressed={queue === id}
                onClick={() => selectQueue(id)}
                className={`rounded-full px-4 py-2 text-sm font-medium ${queue === id ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <input
                aria-label="Search clans or lead mentors"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search clans or lead mentors…"
                className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm"
              />
            </label>
            <select
              aria-label="Filter by program"
              value={programId}
              onChange={(event) => {
                setProgramId(event.target.value);
                setPage(1);
              }}
              className="max-w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
            >
              <option value="">All programs</option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {visible.length ? (
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Clan & lead mentor</th>
                  <th>Status</th>
                  <th>Mentees</th>
                  <th>Approvals</th>
                  <th>Roadblocks</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((clan) => (
                  <tr key={clan.id}>
                    <td>
                      <div className="font-semibold">
                        {can("clan.create") ? (
                          <Link
                            className="text-brand-700 dark:text-brand-300 hover:underline"
                            href={`/admin/clans?clan=${clan.id}`}
                          >
                            {clan.name}
                          </Link>
                        ) : (
                          clan.name
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {clan.leadMentor?.name || "No lead mentor assigned"} ·{" "}
                        {clan.programName}
                      </p>
                    </td>
                    <td>
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${clan.status === "red" ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : clan.status === "amber" ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}`}
                      >
                        {clan.statusLabel}
                      </span>
                      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                        {clan.statusReason}
                      </p>
                    </td>
                    <td className="tabular-nums">{clan.memberCount}</td>
                    <td className="tabular-nums">{clan.pendingApprovals}</td>
                    <td className="tabular-nums">{clan.openBlockers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-brand-600" />
            <p className="font-medium">No clans in this view</p>
            <p className="text-sm text-muted-foreground mt-1">
              Try another filter or search to explore the rest of your
              organization.
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4 text-sm">
          <span className="text-muted-foreground">
            {filtered.length
              ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} of ${filtered.length} clans`
              : "0 clans"}
          </span>
          <div className="flex gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
              className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={currentPage === pages}
              onClick={() => setPage(currentPage + 1)}
              className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>
      {priorityMentees.length > 0 && (
        <section className="rounded-3xl border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg">Mentees to follow up with</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Five priority cases · open the full queue to filter by clan or urgency ·{" "}
                {kpis?.atRisk ?? atRiskMentees.length} mentees flagged overall.
              </p>
            </div>
            {can("user.manage") && (
              <Link
                href="/admin/follow-ups"
                className="text-sm font-medium text-brand-700 dark:text-brand-300"
              >
                Browse all follow-ups →
              </Link>
            )}
          </div>
          <div className="divide-y divide-border">
            {priorityMentees.map((mentee) => (
              <div key={mentee.id} className="flex gap-3 py-4 items-center">
                <Avatar
                  name={mentee.name}
                  src={mentee.avatarUrl}
                  initials={mentee.avatar}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">
                    {can("user.manage") ? (
                      <Link
                        href={`/admin/mentees/${mentee.id}`}
                        className="hover:underline"
                      >
                        {mentee.name}
                      </Link>
                    ) : (
                      mentee.name
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {mentee.riskReason}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {mentee.absoluteProgress}% complete
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {can("community.moderate") && (
        <AnnouncementsCard href="/admin/announcements" limit={2} />
      )}
    </div>
  );
}
