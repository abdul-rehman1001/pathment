'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Award, Loader2, Sparkles, Trophy } from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import { Drawer } from '@/components/shared/Drawer';
import { AgreementBadge, SignalStrip } from '@/components/top-performers/AgreementBadge';
import {
  topPerformersApi, type PerformanceNomination, type PerformanceRankRow,
} from '@/lib/services/top-performers-api';
import { useClan, ALL_CLANS } from '@/lib/context/ClanContext';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

/**
 * Nominating a top performer, from the mentor's side.
 *
 * The data's ranking is shown first — not to decide for them, but so the
 * nomination is made against the same evidence the admin will read. A mentor
 * who puts forward the person ranked eighth is saying something specific, and
 * that is worth more than a vote cast with no reference point.
 *
 * The reasoning is required. The draft button writes a first pass from the
 * mentee's real numbers so nobody faces an empty box, but what gets sent is
 * whatever the mentor leaves in it.
 */
export default function MentorTopPerformersPage() {
  // The sidebar clan picker is the only clan control in the mentor portal, so
  // this page follows it rather than adding a second one of its own.
  const { clans, activeClanId } = useClan();
  const clanId = activeClanId === ALL_CLANS ? (clans[0]?.id ?? '') : activeClanId;
  const [ranking, setRanking] = useState<PerformanceRankRow[]>([]);
  const [mine, setMine] = useState<PerformanceNomination[]>([]);
  const [loading, setLoading] = useState(false);
  const [candidate, setCandidate] = useState<PerformanceRankRow | null>(null);
  const [reasoning, setReasoning] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);

  const clan = clans.find((c) => c.id === clanId) ?? null;

  const load = useCallback(async () => {
    if (!clanId) return;
    try {
      setLoading(true);
      const [rank, nominations] = await Promise.all([
        topPerformersApi.ranking({ clanId }),
        topPerformersApi.list(),
      ]);
      setRanking(rank.data ?? []);
      setMine(nominations.data ?? []);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not load the ranking'));
    } finally {
      setLoading(false);
    }
  }, [clanId]);

  useEffect(() => { load(); }, [load]);

  const nominatedIds = new Set(mine.map((n) => n.menteeId));

  const openNomination = (row: PerformanceRankRow) => {
    setCandidate(row);
    setReasoning('');
  };

  const writeDraft = async () => {
    if (!candidate || !clanId) return;
    try {
      setDrafting(true);
      const res = await topPerformersApi.draft(candidate.menteeId, { clanId });
      setReasoning(res.data?.draft ?? '');
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not draft that'));
    } finally {
      setDrafting(false);
    }
  };

  const submit = async () => {
    if (!candidate || !clanId) return;
    try {
      setSaving(true);
      await topPerformersApi.nominate(candidate.menteeId, { clanId, level: 'clan', reasoning });
      toast.success('Nomination sent to the admin');
      setCandidate(null);
      await load();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not send that nomination'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-slate-900 mb-2 inline-flex items-center gap-2">
            <Trophy className="w-6 h-6 text-brand-600" /> Top performers
          </h1>
          <p className="text-slate-600">
            Put someone forward for your clan. The admin reads your reasoning next to the record.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
        </div>
      ) : ranking.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="text-sm font-semibold text-foreground">Nothing to rank yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Once your mentees have completed work, the ranking appears here.
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          <div>
            <h2 className="text-slate-900">How the record ranks your clan</h2>
            <p className="text-slate-500 text-xs mt-0.5">
              A starting point, not a verdict. Nominate anyone — if you disagree with the order, say why and the admin will see both.
            </p>
          </div>

          {ranking.map((row) => {
            const name = row.mentee ? `${row.mentee.firstName} ${row.mentee.lastName}`.trim() : 'Mentee';
            const already = nominatedIds.has(row.menteeId);
            return (
              <div key={row.menteeId} className="rounded-2xl border border-border bg-card p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center text-sm font-semibold shrink-0">
                      {row.rank}
                    </div>
                    <Avatar src={row.mentee?.profilePictureUrl ?? undefined} name={name} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                      <p className="text-[11px] text-muted-foreground">Score {row.score}</p>
                    </div>
                  </div>
                  {already ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      <Award className="w-3.5 h-3.5" /> Nominated
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openNomination(row)}
                      className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                    >
                      Nominate
                    </button>
                  )}
                </div>
                <SignalStrip signals={row.signals} />
              </div>
            );
          })}
        </section>
      )}

      {mine.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-slate-900">Your nominations</h2>
          {mine.map((n) => (
            <div key={n.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {n.mentee ? `${n.mentee.firstName} ${n.mentee.lastName}`.trim() : 'Mentee'}
                </p>
                <span className="text-[11px] font-medium text-muted-foreground capitalize">{n.status}</span>
              </div>
              <AgreementBadge nomination={n} />
              <p className="text-xs text-muted-foreground leading-relaxed">{n.reasoning}</p>
              {n.decisionNote && (
                <p className="text-[11px] text-foreground border-t border-border pt-2">
                  <span className="font-medium">Admin:</span> {n.decisionNote}
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      <Drawer
        open={candidate !== null}
        onClose={() => setCandidate(null)}
        title={candidate?.mentee ? `Nominate ${candidate.mentee.firstName}` : 'Nominate'}
        subtitle="The admin reads this beside the record"
        width="md"
      >
        {candidate && (
          <div className="space-y-4 pt-1">
            <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Where the record places them
              </p>
              <p className="text-sm font-semibold text-foreground">
                {candidate.rank} of {ranking.length} in {clan?.name}
              </p>
              <SignalStrip signals={candidate.signals} />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">
                Why do they deserve it? <span className="text-amber-600 text-xs">Required</span>
              </label>
              <p className="text-[11px] text-muted-foreground">
                The numbers are already on the page. Write what they do not show.
              </p>
              <textarea
                rows={5}
                value={reasoning}
                onChange={(e) => setReasoning(e.target.value)}
                placeholder="e.g. quietly unblocked half the clan before standup all season"
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button" onClick={writeDraft} disabled={drafting}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Draft from their numbers
              </button>
            </div>

            <div className="flex items-center gap-2 border-t border-border pt-4">
              <button
                type="button" onClick={submit} disabled={saving || !reasoning.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
                Send to the admin
              </button>
              <button
                type="button" onClick={() => setCandidate(null)} disabled={saving}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
