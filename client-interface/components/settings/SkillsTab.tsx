'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Loader2, X, Sparkles, Search, Check, Plus } from 'lucide-react';
import { skillApi, type Skill } from '@/lib/services/skill-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

interface Picked { skillId: string; name: string; proficiencyLevel: number }

// Proficiency: 4 clear levels stored as 1-100. New skills default to Intermediate
// so nobody is forced to set a level - they can tap the pill to adjust.
const LEVELS = [
  { value: 25, label: 'Beginner', cls: 'bg-slate-100 text-slate-600' },
  { value: 50, label: 'Intermediate', cls: 'bg-sky-100 text-sky-700' },
  { value: 75, label: 'Advanced', cls: 'bg-brand-100 text-brand-700' },
  { value: 100, label: 'Expert', cls: 'bg-emerald-100 text-emerald-700' },
];
const DEFAULT_LEVEL = 50;
const levelOf = (n: number) => LEVELS.reduce((b, l) => (Math.abs(l.value - n) < Math.abs(b.value - n) ? l : b), LEVELS[0]);

/**
 * Fast Skills editor: type to search the catalog and add instantly (Enter or
 * click), one-tap suggested chips, and an inline level pill on each skill you
 * can tap to cycle. Auto-saves (debounced) - no Save button to remember.
 */
export function SkillsTab({ heading = 'Your skills', blurb = 'Type to add skills - your level defaults to Intermediate; tap a level pill to change it.' }: { heading?: string; blurb?: string }) {
  const [catalog, setCatalog] = useState<Skill[]>([]);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const firstRun = useRef(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [allRes, mineRes] = await Promise.all([skillApi.listAll(), skillApi.mine()]);
        if (!active) return;
        const all: Skill[] = allRes?.data ?? allRes ?? [];
        const mineRaw: any[] = mineRes?.data ?? mineRes ?? [];
        setCatalog(all);
        setPicked(mineRaw.map((s) => ({
          skillId: s.id,
          name: s.name,
          proficiencyLevel: Number(s.proficiencyLevel ?? s.UserSkill?.proficiencyLevel ?? DEFAULT_LEVEL),
        })));
      } catch {
        toast.error('Could not load skills');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // Auto-save (debounced) on any change - skip the initial server-populated set.
  useEffect(() => {
    if (loading) return;
    if (firstRun.current) { firstRun.current = false; return; }
    setStatus('saving');
    const t = setTimeout(async () => {
      try {
        await skillApi.save(picked.map((p) => ({ skillId: p.skillId, proficiencyLevel: p.proficiencyLevel })));
        setStatus('saved');
      } catch (err) {
        setStatus('idle');
        toast.error(extractApiErrorMessage(err, 'Could not save skills'));
      }
    }, 700);
    return () => clearTimeout(t);
  }, [picked, loading]);

  const pickedIds = useMemo(() => new Set(picked.map((p) => p.skillId)), [picked]);
  const available = useMemo(() => catalog.filter((s) => !pickedIds.has(s.id)), [catalog, pickedIds]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return available.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, available]);

  // Suggested = first chunk of the catalog the user hasn't added (quick one-tap).
  const suggestions = useMemo(() => available.slice(0, 12), [available]);

  const add = (skill: Skill) => {
    setPicked((p) => (p.some((x) => x.skillId === skill.id) ? p : [...p, { skillId: skill.id, name: skill.name, proficiencyLevel: DEFAULT_LEVEL }]));
    setQuery('');
  };
  const remove = (id: string) => setPicked((p) => p.filter((x) => x.skillId !== id));
  const cycleLevel = (id: string) => setPicked((p) => p.map((x) => {
    if (x.skillId !== id) return x;
    const idx = LEVELS.findIndex((l) => l.value === levelOf(x.proficiencyLevel).value);
    return { ...x, proficiencyLevel: LEVELS[(idx + 1) % LEVELS.length].value };
  }));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && matches[0]) { e.preventDefault(); add(matches[0]); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-brand-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-slate-900 flex items-center gap-2"><Sparkles className="w-4 h-4 text-brand-500" />{heading}</h2>
          <p className="text-slate-600 text-sm mt-1">{blurb}</p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1.5 text-xs text-slate-400 mt-1">
          {status === 'saving' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</>
            : status === 'saved' ? <><Check className="w-3.5 h-3.5 text-emerald-500" />Saved</>
            : null}
        </span>
      </div>

      {/* Search to add */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder="Search skills to add…"
          className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {focused && query.trim() && (
          <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-card shadow-lg overflow-hidden">
            {matches.length === 0 ? (
              <p className="px-3.5 py-3 text-sm text-slate-400">No matching skills.</p>
            ) : matches.map((s) => (
              <button key={s.id} type="button" onMouseDown={(e) => { e.preventDefault(); add(s); }}
                className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left text-sm text-slate-700 hover:bg-brand-50">
                <Plus className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                <span className="flex-1 truncate">{s.name}</span>
                {s.category && <span className="text-xs text-slate-400">{s.category}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected skills */}
      {picked.length === 0 ? (
        <p className="text-sm text-slate-400">No skills yet. Search above, or tap a suggestion.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {picked.map((p) => {
            const lvl = levelOf(p.proficiencyLevel);
            return (
              <span key={p.skillId} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-card pl-2.5 pr-1.5 py-1">
                <span className="text-sm font-medium text-slate-800">{p.name}</span>
                <button type="button" onClick={() => cycleLevel(p.skillId)} title="Tap to change level"
                  className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium hover:opacity-80 transition-opacity ${lvl.cls}`}>
                  {lvl.label}
                </button>
                <button type="button" onClick={() => remove(p.skillId)} aria-label={`Remove ${p.name}`} className="p-0.5 text-slate-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
              </span>
            );
          })}
        </div>
      )}

      {/* One-tap suggestions */}
      {suggestions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">Suggested</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s.id} type="button" onClick={() => add(s)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-slate-300 text-sm text-slate-600 hover:border-brand-400 hover:text-brand-700 hover:bg-brand-50 transition-colors">
                <Plus className="w-3 h-3" />{s.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default SkillsTab;
