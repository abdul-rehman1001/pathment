'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { Competency } from '@/lib/services/competency-api';

/**
 * One person, scored against the rubric, in four taps.
 *
 * This is the whole feature standing or falling. A facilitator who finishes a
 * sixty minute discussion and then opens a form to score six people is really
 * recording a memory of the loudest one, so the strip has to be usable WHILE
 * the room is still talking: one row per competency, four targets per row,
 * big enough to hit without looking, and saved the moment it is tapped.
 *
 * Four points, with no middle. A five point scale has a centre and the centre
 * is where a tired reviewer puts everybody; four forces a side.
 */

const LEVELS = [
  { value: 1, label: 'Not yet', hint: 'Did not show it' },
  { value: 2, label: 'Emerging', hint: 'Showed it with prompting' },
  { value: 3, label: 'Solid', hint: 'Showed it unprompted' },
  { value: 4, label: 'Strong', hint: 'Showed it, and lifted the room' },
] as const;

const TONE: Record<number, string> = {
  1: 'bg-rose-500 text-white border-rose-500',
  2: 'bg-amber-500 text-white border-amber-500',
  3: 'bg-sky-500 text-white border-sky-500',
  4: 'bg-emerald-600 text-white border-emerald-600',
};

export function RubricStrip({
  competencies,
  scores,
  onScore,
  disabled = false,
  compact = false,
}: {
  competencies: Competency[];
  /** What is already recorded, by competency id. */
  scores: Record<string, number>;
  onScore: (competencyId: string, score: number) => Promise<void> | void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<string | null>(null);

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(null), 1200);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const pick = async (competencyId: string, value: number) => {
    if (disabled || saving) return;
    setSaving(competencyId);
    try {
      await onScore(competencyId, value);
      setJustSaved(competencyId);
    } finally {
      setSaving(null);
    }
  };

  if (!competencies.length) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        No rubric set up yet. An admin can add one in settings.
      </p>
    );
  }

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {competencies.map((competency) => {
        const current = scores[competency.id];
        return (
          <div key={competency.id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground" title={competency.description || undefined}>
                {competency.name}
              </p>
              {!compact && competency.description && (
                <p className="truncate text-[11px] text-muted-foreground">{competency.description}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1" role="group" aria-label={competency.name}>
              {LEVELS.map((level) => {
                const active = current === level.value;
                return (
                  <button
                    key={level.value}
                    type="button"
                    onClick={() => pick(competency.id, level.value)}
                    disabled={disabled}
                    aria-pressed={active}
                    // The number is what gets hit at a glance; the words are
                    // the tooltip, because reading four labels per row for six
                    // people is not something anybody does mid-conversation.
                    title={`${level.label} — ${level.hint}`}
                    className={`h-8 w-8 rounded-lg border text-sm font-semibold tabular-nums transition-colors disabled:opacity-40 ${
                      active ? TONE[level.value] : 'border-border bg-card text-slate-500 hover:bg-muted'
                    }`}
                  >
                    {level.value}
                  </button>
                );
              })}
              <span className="ml-0.5 w-4 shrink-0">
                {saving === competency.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" />}
                {justSaved === competency.id && saving !== competency.id && (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default RubricStrip;
