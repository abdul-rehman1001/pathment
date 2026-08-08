'use client';

import { Loader2, TrendingDown, Flag, CalendarClock, Scale } from 'lucide-react';
import { PageHeader } from '@/components/admin/ui';
import { useOrgInsights, type InsightStatus } from '@/lib/hooks/admin';

const STATUS_DOT: Record<InsightStatus, string> = {
  red: 'bg-red-500', amber: 'bg-amber-500', green: 'bg-emerald-500',
};
const STATUS_BADGE: Record<InsightStatus, string> = {
  red: 'bg-red-50 text-red-700', amber: 'bg-amber-50 text-amber-700', green: 'bg-emerald-50 text-emerald-700',
};

export default function AdminInsights() {
  const { insights, loading, error, refetch } = useOrgInsights();

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>;
  }
  if (error || !insights) {
    return (
      <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
        <p className="text-slate-600 mb-3">{error || 'No insights available.'}</p>
        <button onClick={refetch} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
      </div>
    );
  }

  const { kpis, fairness, clans, distribution, redClans } = insights;
  const gap = fairness.gap;

  return (
    <div className="space-y-6">
      <PageHeader title="Insights" subtitle="Outcomes, fairness and clan comparisons across the org" />

      {/* Fairness digest - the org's headline story */}
      <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 dark:from-brand-500/10 to-card p-5 flex flex-wrap items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
          <Scale className="w-5 h-5 text-brand-600" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">Fairness lens</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">
            <strong className="text-slate-900">{kpis.clans - kpis.clansRed} of {kpis.clans} clans healthy</strong>
            {kpis.clansRed > 0 ? <> · {redClans.slice(0, 3).join(', ')}{redClans.length > 3 ? ` +${redClans.length - 3}` : ''} need attention</> : <> · none in the red</>}.
            {' '}Org relative progress runs{' '}
            <strong className="text-brand-700 tabular-nums">{gap >= 0 ? `${gap} pts above` : `${Math.abs(gap)} pts below`}</strong>{' '}
            absolute, so mentors are logging real constraints rather than hiding them.
          </p>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Avg completion', value: `${kpis.avgCompletion}%`, accent: 'bg-sky-500' },
          { label: 'Extensions granted', value: String(kpis.totalExtensions), accent: 'bg-amber-500' },
          { label: 'Open roadblocks', value: String(kpis.totalOpenBlockers), accent: 'bg-red-500' },
          { label: 'Clans in red', value: String(kpis.clansRed), accent: 'bg-red-500' },
        ].map((s) => (
          <div key={s.label} className="relative overflow-hidden rounded-2xl bg-card border border-slate-200 p-5">
            <span className={`absolute left-0 top-0 h-full w-1 ${s.accent}`} />
            <div className="text-xs text-slate-500">{s.label}</div>
            <div className="mt-1.5 text-2xl font-semibold text-slate-900 tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Clan comparison - worst first */}
      <div className="bg-card rounded-2xl border border-slate-200">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="text-slate-900">Clan comparison</h2>
          <p className="text-xs text-slate-400 mt-0.5">All {clans.length} clans, worst first.</p>
        </div>
        {clans.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-400">No clans yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Clan', 'Members', 'Completion', 'On-time', 'Fair', 'Extensions', 'Roadblocks', 'At-risk'].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-slate-400 ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clans.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${STATUS_DOT[c.status]}`} />
                        <span className="font-medium text-slate-900">{c.name}</span>
                        <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium ${STATUS_BADGE[c.status]}`}>{c.statusLabel}</span>
                        <span className="text-xs text-slate-400 hidden md:inline">· {c.program}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{c.memberCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-900">{c.avgCompletion}%</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${c.avgOnTime < 60 ? 'text-red-600' : 'text-slate-900'}`}>{c.avgOnTime}%</td>
                    <td className="px-4 py-3 text-right tabular-nums text-brand-700">{c.avgRelative}%</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{c.extensions}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${c.openBlockers >= 5 ? 'text-red-600' : 'text-slate-600'}`}>{c.openBlockers}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={c.atRisk > 0 ? 'text-red-600 font-medium' : 'text-slate-400'}>{c.atRisk}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Absolute vs relative - the fairness distribution */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="bg-card rounded-2xl border border-slate-200 p-6 lg:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Org cohort average</p>
          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500"><span>Absolute</span><span className="tabular-nums font-medium text-slate-700">{fairness.avgAbsolute}%</span></div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-slate-400 rounded-full" style={{ width: `${fairness.avgAbsolute}%` }} /></div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-slate-500"><span>Relative (fair)</span><span className="tabular-nums font-medium text-brand-700">{fairness.avgRelative}%</span></div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-brand-500 rounded-full" style={{ width: `${fairness.avgRelative}%` }} /></div>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            The cohort runs <strong className="text-brand-700 tabular-nums">{Math.abs(gap)} pts</strong> {gap >= 0 ? 'higher' : 'lower'} on
            relative progress, so logged delays and roadblocks are shifting the picture.
          </p>
        </div>

        <div className="bg-card rounded-2xl border border-slate-200 p-6 lg:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-3">By mentee, widest fairness gap first</p>
          {distribution.length === 0 ? (
            <p className="text-sm text-slate-400">No mentees to show.</p>
          ) : (
            <div className="space-y-3">
              {distribution.map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <div className="w-28 shrink-0 truncate text-xs font-medium text-slate-700">{m.name}</div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-3 shrink-0 text-[9px] uppercase text-slate-400">A</span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-slate-400 rounded-full" style={{ width: `${m.absolute}%` }} /></div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 shrink-0 text-[9px] uppercase text-slate-400">R</span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-brand-500 rounded-full" style={{ width: `${m.relative}%` }} /></div>
                    </div>
                  </div>
                  <div className={`w-10 shrink-0 text-right text-[11px] tabular-nums ${m.gap > 0 ? 'text-brand-600' : 'text-slate-400'}`}>
                    {m.gap >= 0 ? '+' : ''}{m.gap}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Trend summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-card rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2"><CalendarClock className="w-4 h-4 text-amber-500" /><span className="text-xs text-slate-500">Extensions granted</span></div>
          <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">{kpis.totalExtensions}</div>
          <p className="mt-1 text-xs text-slate-400">Accepted delays across all clans.</p>
        </div>
        <div className="bg-card rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2"><Flag className="w-4 h-4 text-red-500" /><span className="text-xs text-slate-500">Open roadblocks</span></div>
          <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">{kpis.totalOpenBlockers}</div>
          <p className="mt-1 text-xs text-slate-400">{clans.length ? `Densest in ${[...clans].sort((a, b) => b.openBlockers - a.openBlockers)[0].name}.` : '-'}</p>
        </div>
        <div className="bg-card rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-500" /><span className="text-xs text-slate-500">Clans in red</span></div>
          <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">{kpis.clansRed}</div>
          <p className="mt-1 text-xs text-slate-400">{redClans.length ? redClans.join(', ') : 'No clan in the red.'}</p>
        </div>
      </div>
    </div>
  );
}
