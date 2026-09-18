'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Award, Loader2, Trophy, Users } from 'lucide-react';
import { Avatar } from '@/components/shared/Avatar';
import { SelectMenu } from '@/components/shared/SelectMenu';
import { AgreementBadge, SignalStrip } from '@/components/top-performers/AgreementBadge';
import { topPerformersApi, type PerformanceNomination } from '@/lib/services/top-performers-api';
import { programsApi } from '@/lib/services/program-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

/**
 * Top performers, as the admin sees them.
 *
 * An admin cannot know four hundred mentees, and cannot take twenty mentors'
 * word for it unexamined either. So every nomination shows three things at
 * once: what the mentor wrote, where the record placed that mentee at the time,
 * and the numbers behind that placing. Agreement and disagreement are both
 * visible without opening anything.
 */
export default function AdminTopPerformersPage() {
  const [programs, setPrograms] = useState<Array<{ id: string; name: string }>>([]);
  const [programId, setProgramId] = useState('');
  const [rows, setRows] = useState<PerformanceNomination[]>([]);
  const [loading, setLoading] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    programsApi.getAll()
      .then((res) => {
        const list = (res?.data ?? []).map((p) => ({ id: p.id, name: p.name }));
        setPrograms(list);
        if (list.length && !programId) setProgramId(list[0].id);
      })
      .catch(() => toast.error('Could not load programmes'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!programId) return;
    try {
      setLoading(true);
      const res = await topPerformersApi.list(programId);
      setRows(res.data ?? []);
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not load nominations'));
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: string, status: 'shortlisted' | 'awarded' | 'declined') => {
    try {
      setDeciding(id);
      await topPerformersApi.decide(id, { status, decisionNote: notes[id]?.trim() || undefined });
      toast.success(status === 'awarded' ? 'Award confirmed' : `Marked ${status}`);
      await load();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not record that decision'));
    } finally {
      setDeciding(null);
    }
  };

  const open = rows.filter((r) => r.status === 'nominated' || r.status === 'shortlisted');
  const closed = rows.filter((r) => r.status === 'awarded' || r.status === 'declined');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-slate-900 mb-2 inline-flex items-center gap-2">
            <Trophy className="w-6 h-6 text-brand-600" /> Top performers
          </h1>
          <p className="text-slate-600">
            Mentors put people forward and say why. The record ranks them independently. You decide.
          </p>
        </div>
        {programs.length > 0 && (
          <SelectMenu
            value={programId}
            onChange={setProgramId}
            options={programs.map((p) => ({ value: p.id, label: p.name }))}
            ariaLabel="Programme"
            className="min-w-[220px]"
          />
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Users className="w-10 h-10 text-brand-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-foreground">No nominations yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Mentors nominate from their clan. They appear here with their reasoning.
          </p>
        </div>
      ) : (
        <>
          <Section title="Waiting on you" count={open.length}>
            {open.map((n) => (
              <NominationCard
                key={n.id} nomination={n} busy={deciding === n.id}
                note={notes[n.id] ?? ''}
                onNote={(v) => setNotes((prev) => ({ ...prev, [n.id]: v }))}
                onDecide={(status) => decide(n.id, status)}
              />
            ))}
          </Section>

          {closed.length > 0 && (
            <Section title="Decided" count={closed.length}>
              {closed.map((n) => (
                <NominationCard key={n.id} nomination={n} busy={false} readOnly
                  note="" onNote={() => {}} onDecide={() => {}} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-slate-900">{title} <span className="text-slate-500">({count})</span></h2>
      {children}
    </section>
  );
}

function NominationCard({
  nomination, busy, note, onNote, onDecide, readOnly = false,
}: {
  nomination: PerformanceNomination;
  busy: boolean;
  note: string;
  onNote: (value: string) => void;
  onDecide: (status: 'shortlisted' | 'awarded' | 'declined') => void;
  readOnly?: boolean;
}) {
  const name = nomination.mentee
    ? `${nomination.mentee.firstName} ${nomination.mentee.lastName}`.trim()
    : 'Mentee';

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar src={nomination.mentee?.profilePictureUrl ?? undefined} name={name} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{name}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {nomination.clanName ? `${nomination.clanName} · ` : ''}
              nominated by {nomination.nominatedBy || 'a mentor'}
              {nomination.level === 'fellowship' && ' · fellowship award'}
            </p>
          </div>
        </div>
        <AgreementBadge nomination={nomination} />
      </div>

      {/* The mentor's own words — the reason they were asked in the first place. */}
      <div className="rounded-xl border border-brand-500/20 bg-brand-500/5 p-3.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-400 mb-1">
          Why the mentor put them forward
        </p>
        <p className="text-xs text-foreground leading-relaxed">
          {nomination.reasoning || 'No reasoning was recorded.'}
        </p>
      </div>

      <SignalStrip signals={nomination.systemSignals} />

      {nomination.decisionNote && (
        <p className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{nomination.status}</span>
          {nomination.decidedBy && ` by ${nomination.decidedBy}`} — {nomination.decisionNote}
        </p>
      )}

      {!readOnly && (
        <div className="space-y-2.5 border-t border-border pt-4">
          <textarea
            rows={2}
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="A note on your decision (optional, but it is what the mentor reads)"
            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button" disabled={busy} onClick={() => onDecide('awarded')}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
              Award
            </button>
            {nomination.status !== 'shortlisted' && (
              <button
                type="button" disabled={busy} onClick={() => onDecide('shortlisted')}
                className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:border-brand-500/40 disabled:opacity-50"
              >
                Shortlist for the fellowship
              </button>
            )}
            <button
              type="button" disabled={busy} onClick={() => onDecide('declined')}
              className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
