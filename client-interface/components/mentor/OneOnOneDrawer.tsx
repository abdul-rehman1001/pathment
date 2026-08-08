'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { X, Loader2, Check } from 'lucide-react';

const KINDS = ['1:1', 'standup', 'review', 'pairing'];
const SENTIMENTS: { key: string; label: string }[] = [
  { key: 'positive', label: 'Positive' },
  { key: 'neutral', label: 'Neutral' },
  { key: 'low', label: 'Low' },
];
const STYLE_AXES: { key: keyof WorkingStyle; label: string }[] = [
  { key: 'consistency', label: 'Consistency' },
  { key: 'communication', label: 'Communication' },
  { key: 'resilience', label: 'Resilience' },
  { key: 'independence', label: 'Independence' },
];

interface WorkingStyle { consistency: number; communication: number; resilience: number; independence: number }

export interface Specialist { id: string; name: string; role: string }

export interface OneOnOneData {
  kind: string;
  summary: string;
  sentiment: string;
  issues: string[];
  nextSteps: string[];
  personalityRead: string;
  workingStyle: WorkingStyle;
  blockers: string[];
  attributedTo: string;
  attributedToId: string | null;
}

/**
 * Log a 1:1 after it happens - capture the *understanding*: who logged it,
 * sentiment, a personality/working-style read, issues, blockers to track, and
 * next steps. Personality + working-style flow onto the mentee's profile;
 * blockers become real open blockers.
 */
export function OneOnOneDrawer({
  menteeName,
  selfName = 'You',
  specialists = [],
  onClose,
  onSave,
}: {
  menteeName: string;
  selfName?: string;
  specialists?: Specialist[];
  onClose: () => void;
  onSave: (data: OneOnOneData) => Promise<void>;
}) {
  const [loggedBy, setLoggedBy] = useState('self'); // 'self' | specialist id
  const [kind, setKind] = useState('1:1');
  const [sentiment, setSentiment] = useState('neutral');
  const [summary, setSummary] = useState('');
  const [issues, setIssues] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [blockers, setBlockers] = useState('');
  const [personalityRead, setPersonalityRead] = useState('');
  const [workingStyle, setWorkingStyle] = useState<WorkingStyle>({ consistency: 50, communication: 50, resilience: 50, independence: 50 });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!summary.trim()) { toast.error('Add a short summary'); return; }
    const specialist = specialists.find((s) => s.id === loggedBy);
    try {
      setSaving(true);
      await onSave({
        kind, sentiment, summary: summary.trim(),
        issues: issues.split('\n').map((s) => s.trim()).filter(Boolean),
        nextSteps: nextSteps.split('\n').map((s) => s.trim()).filter(Boolean),
        personalityRead: personalityRead.trim(),
        workingStyle,
        blockers: blockers.split('\n').map((s) => s.trim()).filter(Boolean),
        attributedTo: specialist ? specialist.name : selfName,
        attributedToId: specialist ? specialist.id : null,
      });
      toast.success('1:1 logged');
      onClose();
    } catch { toast.error('Could not log the 1:1'); }
    finally { setSaving(false); }
  };

  const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-md h-full bg-card border-l border-slate-200 dark:border-slate-700 shadow-2xl dark:shadow-[-8px_0_30px_rgba(0,0,0,0.6)] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Log a 1:1</h2>
            <p className="text-sm text-slate-500">{menteeName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Session type</label>
              <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${field} capitalize`}>
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Logged by</label>
              <select value={loggedBy} onChange={(e) => setLoggedBy(e.target.value)} className={field}>
                <option value="self">{selfName} (you)</option>
                {specialists.map((s) => <option key={s.id} value={s.id}>{s.name} - {s.role}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">How did it go?</label>
            <div className="flex gap-2">
              {SENTIMENTS.map((s) => (
                <button key={s.key} onClick={() => setSentiment(s.key)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    sentiment === s.key ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Summary</label>
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="What did you talk about?" className={`${field} resize-none`} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Personality read</label>
            <textarea value={personalityRead} onChange={(e) => setPersonalityRead(e.target.value)} rows={2}
              placeholder="e.g. Responds best to async written feedback; gets discouraged by vague asks." className={`${field} resize-none`} />
            <p className="mt-1 text-xs text-slate-400">What did you learn about how they think, communicate, stay motivated? Flows to their profile.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Working-style calibration</label>
            <div className="space-y-3">
              {STYLE_AXES.map(({ key, label }) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-slate-600">{label}</span>
                    <span className="text-xs font-semibold text-slate-700 tabular-nums">{workingStyle[key]}</span>
                  </div>
                  <input type="range" min={0} max={100} value={workingStyle[key]}
                    onChange={(e) => setWorkingStyle((w) => ({ ...w, [key]: Number(e.target.value) }))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-brand-600 bg-slate-100" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Issues raised <span className="text-slate-400 font-normal">(one per line)</span></label>
            <textarea value={issues} onChange={(e) => setIssues(e.target.value)} rows={2} className={`${field} resize-none`} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Roadblocks to track <span className="text-slate-400 font-normal">(one per line)</span></label>
            <textarea value={blockers} onChange={(e) => setBlockers(e.target.value)} rows={2} placeholder="Anything in their way to follow up on" className={`${field} resize-none`} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Next steps <span className="text-slate-400 font-normal">(one per line)</span></label>
            <textarea value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} rows={2} className={`${field} resize-none`} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Save 1:1
          </button>
        </div>
      </div>
    </div>
  );
}
