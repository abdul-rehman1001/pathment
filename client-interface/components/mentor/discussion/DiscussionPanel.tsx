'use client';

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Mic, MicOff, GripVertical, Play, MessageSquareQuote, Pencil, Check, X } from 'lucide-react';
import { mentorApi } from '@/lib/services/mentor-api';
import { competencyApi, type Competency } from '@/lib/services/competency-api';
import { useApiQuery, qk, STALE } from '@/lib/query';
import { Avatar } from '@/components/shared/Avatar';
import { RubricStrip } from './RubricStrip';

/**
 * Running a group discussion or a presentation.
 *
 * The room is the screen. Everybody who is in the session is a row, and each
 * row carries the two things a facilitator is actually weighing: how long this
 * person has spoken, and what they were worth on the rubric. Both are in front
 * of them while it happens, because the alternative - scoring afterwards from
 * memory - reliably produces a record of whoever talked most.
 *
 * `talkSeconds` is already measured by the call and was never shown anywhere.
 * It is the cheapest honest signal in the product: it separates "spoke
 * constantly, said little" from "spoke once, was decisive", and it surfaces
 * the person who has not been given a turn, which is a facilitation problem
 * rather than a mentee one.
 */

interface Entry {
  menteeId: string;
  mentee?: { id: string; firstName?: string; lastName?: string } | null;
  attendance?: string | null;
  status?: string;
  talkSeconds?: number;
  speakingOrder?: number | null;
  competencyScores?: { competencyId: string; score: number }[];
}

interface Session {
  id: string;
  kind?: 'review' | 'discussion' | 'presentation';
  scenario?: string | null;
  status?: string;
  entries?: Entry[];
}

const nameOf = (entry: Entry) =>
  `${entry.mentee?.firstName || ''} ${entry.mentee?.lastName || ''}`.trim() || 'Mentee';

const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function DiscussionPanel({ session, onChanged }: {
  session: Session;
  onChanged: () => void | Promise<unknown>;
}) {
  const presentation = session.kind === 'presentation';
  const [editingScenario, setEditingScenario] = useState(false);
  const [draft, setDraft] = useState(session.scenario || '');
  const [nowSpeaking, setNowSpeaking] = useState<string | null>(null);

  const { data: competencies } = useApiQuery<Competency[]>({
    queryKey: qk.competencies.list,
    queryFn: () => competencyApi.list(),
    staleTime: STALE.long,
  });

  const entries = useMemo(() => session.entries ?? [], [session.entries]);

  /** The quietest person in the room, so the facilitator can bring them in. */
  const quietest = useMemo(() => {
    const spoken = entries.filter((e) => e.attendance !== 'absent');
    if (spoken.length < 2) return null;
    return [...spoken].sort((a, b) => (a.talkSeconds || 0) - (b.talkSeconds || 0))[0];
  }, [entries]);

  const scoresFor = useCallback((entry: Entry) => {
    const out: Record<string, number> = {};
    for (const s of entry.competencyScores ?? []) out[s.competencyId] = s.score;
    return out;
  }, []);

  const score = async (menteeId: string, competencyId: string, value: number) => {
    try {
      await mentorApi.scoreReviewEntry(session.id, menteeId, [{ competencyId, score: value }]);
      await onChanged();
    } catch (error) {
      toast.error((error as { message?: string })?.message || 'Could not save that score');
    }
  };

  const saveScenario = async () => {
    try {
      await mentorApi.updateReviewSession(session.id, { scenario: draft.trim() || null });
      setEditingScenario(false);
      await onChanged();
    } catch (error) {
      toast.error((error as { message?: string })?.message || 'Could not save the prompt');
    }
  };

  const move = async (menteeId: string, direction: -1 | 1) => {
    const order = entries.map((e) => e.menteeId);
    const from = order.indexOf(menteeId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    try {
      await mentorApi.setSpeakingOrder(session.id, order);
      await onChanged();
    } catch (error) {
      toast.error((error as { message?: string })?.message || 'Could not reorder');
    }
  };

  const done = entries.filter((e) => (e.competencyScores?.length ?? 0) > 0).length;

  return (
    <div className="space-y-4">
      {/* ── The prompt everybody is working from ───────────────────── */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <MessageSquareQuote className="h-4 w-4" aria-hidden />
            {presentation ? 'What they are presenting' : 'The scenario'}
          </h3>
          {!editingScenario && (
            <button
              type="button"
              onClick={() => { setDraft(session.scenario || ''); setEditingScenario(true); }}
              className="shrink-0 text-xs font-medium text-brand-600 hover:underline"
            >
              <Pencil className="mr-1 inline h-3 w-3" />
              {session.scenario ? 'Edit' : 'Add one'}
            </button>
          )}
        </div>

        {editingScenario ? (
          <div className="mt-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              autoFocus
              maxLength={4000}
              placeholder="The client moved the deadline up two weeks and the API is not ready. What do you do, and why?"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <div className="mt-2 flex items-center gap-2">
              <button type="button" onClick={saveScenario}
                className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
                <Check className="h-3.5 w-3.5" /> Save
              </button>
              <button type="button" onClick={() => setEditingScenario(false)}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <span className="text-xs text-muted-foreground">
                A specific, uncomfortable prompt gets a real answer. A general one gets a template.
              </span>
            </div>
          </div>
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
            {session.scenario || (
              <span className="text-muted-foreground">
                Nothing set yet. Everyone sees this, so it is worth a sentence.
              </span>
            )}
          </p>
        )}
      </section>

      {/* ── Who has spoken, and what they were worth ───────────────── */}
      <section className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">
            {presentation ? 'Running order' : 'The room'}{' '}
            <span className="font-normal text-muted-foreground">
              · {done} of {entries.length} scored
            </span>
          </h3>
          {quietest && (quietest.talkSeconds || 0) === 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              <MicOff className="h-3.5 w-3.5" aria-hidden />
              {nameOf(quietest)} has not spoken yet
            </span>
          )}
        </div>

        {!entries.length ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nobody in this session yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((entry, index) => {
              const speaking = nowSpeaking === entry.menteeId;
              const absent = entry.attendance === 'absent';
              return (
                <li
                  key={entry.menteeId}
                  className={`px-4 py-3 transition-colors ${speaking ? 'bg-brand-50/60 dark:bg-brand-500/10' : ''} ${absent ? 'opacity-55' : ''}`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    {presentation && (
                      <div className="flex shrink-0 flex-col">
                        <button type="button" onClick={() => move(entry.menteeId, -1)} disabled={index === 0}
                          aria-label="Move up"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30">
                          <GripVertical className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    {presentation && (
                      <span className="w-5 shrink-0 text-center text-sm font-semibold tabular-nums text-muted-foreground">
                        {entry.speakingOrder ?? index + 1}
                      </span>
                    )}
                    <Avatar name={nameOf(entry)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{nameOf(entry)}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        {(entry.talkSeconds || 0) > 0 ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
                        {absent ? 'Absent' : `spoke ${mmss(entry.talkSeconds || 0)}`}
                      </p>
                    </div>
                    {presentation && !absent && (
                      <button
                        type="button"
                        onClick={() => setNowSpeaking(speaking ? null : entry.menteeId)}
                        className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          speaking
                            ? 'border-brand-600 bg-brand-600 text-white'
                            : 'border-border bg-card text-slate-600 hover:bg-muted'
                        }`}
                      >
                        <Play className="h-3 w-3" /> {speaking ? 'Presenting' : 'Start'}
                      </button>
                    )}
                  </div>

                  {!absent && (
                    <div className="mt-2.5 sm:pl-11">
                      <RubricStrip
                        competencies={competencies ?? []}
                        scores={scoresFor(entry)}
                        onScore={(competencyId, value) => score(entry.menteeId, competencyId, value)}
                        disabled={session.status === 'finished'}
                        compact
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default DiscussionPanel;
