'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { OrganizationCharts } from '@/components/admin/OrganizationCharts';
import { PageHeader } from '@/components/admin/ui';
import { useOrgInsights, type InsightStatus } from '@/lib/hooks/admin';

const STATUS_LABEL: Record<InsightStatus, string> = {
  red: 'High priority', amber: 'Watch', green: 'Healthy',
};
const STATUS_BADGE: Record<InsightStatus, string> = {
  red: 'bg-rose-50 text-rose-700', amber: 'bg-amber-50 text-amber-700', green: 'bg-emerald-50 text-emerald-700',
};
const PAGE_SIZE = 8;

export default function AdminInsights() {
  const [view, setView] = useState<'overview' | 'clans'>('overview');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const { insights, loading, error, refetch } = useOrgInsights();

  if (loading) return <div role="status" className="flex items-center justify-center gap-2 py-24 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading insights…</div>;
  if (error || !insights) return <div className="rounded-xl border bg-card p-8 text-center"><p>{error || 'No insights available.'}</p><button onClick={refetch} className="mt-3 text-sm text-brand-700">Try again</button></div>;

  const { kpis, clans, fairness } = insights;
  const filtered = clans.filter(clan => (status === 'all' || clan.status === status) && `${clan.name} ${clan.program}`.toLowerCase().includes(search.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-5">
      <PageHeader title="Insights" subtitle={`${kpis.activeMentees.toLocaleString()} active mentees · ${kpis.clans.toLocaleString()} clans · current snapshot`} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-xl border border-border bg-card p-1" aria-label="Insight views">
          {(['overview', 'clans'] as const).map(item => <button key={item} aria-pressed={view === item} onClick={() => setView(item)} className={`rounded-lg px-4 py-2 text-sm font-medium ${view === item ? 'bg-brand-600 text-white' : 'text-muted-foreground hover:bg-muted'}`}>{item === 'overview' ? 'At a glance' : 'Compare clans'}</button>)}
        </div>
        <Link href="/admin/follow-ups" className="text-sm font-medium text-brand-700 hover:underline">Open follow-up queue →</Link>
      </div>

      {view === 'overview' ? <>
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
          <div>
            <h2 className="font-semibold text-foreground">{kpis.clansRed ? `${kpis.clansRed.toLocaleString()} ${kpis.clansRed === 1 ? 'clan needs' : 'clans need'} priority attention` : 'No clans in the highest concern group'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{kpis.avgCompletion}% average completion · {kpis.totalOpenBlockers.toLocaleString()} open roadblocks</p>
          </div>
          <button onClick={() => { setStatus(kpis.clansRed ? 'red' : 'all'); setPage(1); setView('clans'); }} className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">Review clans →</button>
        </section>
        <OrganizationCharts summary={insights.summary} />
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">How adjustments affect progress</summary>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Recorded progress averages {fairness.avgAbsolute}%; adjusted progress averages {fairness.avgRelative}%. There are {kpis.totalExtensions.toLocaleString()} approved extensions. Adjustments provide context, not a ranking of individual mentees.</p>
        </details>
      </> : <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <input aria-label="Search clan comparisons" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Find a clan or program…" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <select aria-label="Filter clans by health" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="all">All health states</option><option value="red">High priority</option><option value="amber">Watch</option><option value="green">Healthy</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Clan comparison, highest concern first</caption>
            <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>{['Clan', 'Completion', 'Needs follow-up', ''].map((label, index) => <th key={index} scope="col" className={`px-4 py-3 font-medium ${index === 0 ? 'text-left' : 'text-right'}`}>{label || <span className="sr-only">Action</span>}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">{visible.map(clan => <tr key={clan.id} className="hover:bg-muted/30">
              <td className="px-4 py-3"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{clan.name}</span><span className={`rounded-md px-2 py-0.5 text-xs ${STATUS_BADGE[clan.status]}`}>{STATUS_LABEL[clan.status]}</span></div><p className="mt-1 text-xs text-muted-foreground">{clan.program} · {clan.memberCount.toLocaleString()} mentees</p></td>
              <td className="px-4 py-3 text-right tabular-nums">{clan.avgCompletion}%</td>
              <td className="px-4 py-3 text-right tabular-nums">{clan.atRisk.toLocaleString()}</td>
              <td className="px-4 py-3 text-right"><Link href={`/admin/follow-ups?clanId=${encodeURIComponent(clan.id)}`} aria-label={`View follow-ups for ${clan.name}`} className="whitespace-nowrap text-brand-700 hover:underline">Follow-ups →</Link></td>
            </tr>)}</tbody>
          </table>
          {!visible.length && <p className="p-8 text-center text-sm text-muted-foreground">No clans match these filters.</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-xs text-muted-foreground">
          <p aria-live="polite">{filtered.length ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)} of ${filtered.length.toLocaleString()} clans` : '0 clans'} · highest concern first</p>
          <div className="flex items-center gap-3"><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>{currentPage} / {pages}</span><button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div>
        </div>
      </section>}
    </div>
  );
}
