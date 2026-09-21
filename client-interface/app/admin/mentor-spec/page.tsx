'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Compass, Plus, Trash2, Loader2, Save } from 'lucide-react';
import { useMentorSpec } from '@/lib/hooks/shared/useMentorSpec';
import type { MentorSpec } from '@/lib/services/mentor-spec-api';

const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

/** Admin editor for the org mentor handbook (read-only for mentors at /mentor/spec). */
export default function AdminMentorSpecPage() {
  const { spec, loading, save } = useMentorSpec();
  const [draft, setDraft] = useState<MentorSpec | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (spec && !draft) setDraft(structuredClone(spec)); }, [spec, draft]);

  if (loading || !draft) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>;
  }

  const set = (patch: Partial<MentorSpec>) => setDraft((d) => ({ ...(d as MentorSpec), ...patch }));
  const submit = async () => {
    try { setSaving(true); await save(draft); toast.success('Handbook saved'); }
    catch { toast.error('Could not save'); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="admin-page-heading flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-1 flex items-center gap-2"><Compass className="w-5 h-5 text-brand-600" /> Mentor handbook</h1>
          <p className="text-slate-600 text-sm">The shared guide for every mentor. Changes are published when you save.</p>
        </div>
        <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 shrink-0">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </button>
      </div>

      <nav aria-label="Handbook sections" className="flex flex-wrap gap-2">
        {['Intro','Principles','Time commitment','Responsibilities','Code of conduct','FAQs'].map(title => <a key={title} href={`#handbook-${title.toLowerCase().replaceAll(' ','-')}`} className="rounded-full border border-border bg-card px-4 py-2 text-sm hover:bg-muted">{title}</a>)}
      </nav>
      <Section title="Intro">
        <textarea value={draft.intro} onChange={(e) => set({ intro: e.target.value })} rows={2} className={`${field} resize-none`} />
      </Section>

      <Section title="Principles" onAdd={() => set({ principles: [...draft.principles, { title: '', body: '' }] })}>
        {draft.principles.map((p, i) => (
          <Row key={i} onRemove={() => set({ principles: draft.principles.filter((_, j) => j !== i) })}>
            <input value={p.title} placeholder="Title" onChange={(e) => set({ principles: draft.principles.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} className={field} />
            <textarea value={p.body} placeholder="Description" rows={2} onChange={(e) => set({ principles: draft.principles.map((x, j) => j === i ? { ...x, body: e.target.value } : x) })} className={`${field} resize-none mt-2`} />
          </Row>
        ))}
      </Section>

      <Section title="Time commitment" onAdd={() => set({ time: [...draft.time, { value: '', label: '' }] })}>
        {draft.time.map((t, i) => (
          <Row key={i} onRemove={() => set({ time: draft.time.filter((_, j) => j !== i) })}>
            <div className="flex gap-2">
              <input value={t.value} placeholder="e.g. ~3h" onChange={(e) => set({ time: draft.time.map((x, j) => j === i ? { ...x, value: e.target.value } : x) })} className={`${field} w-28`} />
              <input value={t.label} placeholder="label" onChange={(e) => set({ time: draft.time.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} className={field} />
            </div>
          </Row>
        ))}
      </Section>

      <ListSection title="Responsibilities" items={draft.responsibilities} onChange={(responsibilities) => set({ responsibilities })} />
      <ListSection title="Code of conduct" items={draft.conduct} onChange={(conduct) => set({ conduct })} />

      <Section title="FAQs" onAdd={() => set({ faqs: [...draft.faqs, { q: '', a: '' }] })}>
        {draft.faqs.map((f, i) => (
          <Row key={i} onRemove={() => set({ faqs: draft.faqs.filter((_, j) => j !== i) })}>
            <input value={f.q} placeholder="Question" onChange={(e) => set({ faqs: draft.faqs.map((x, j) => j === i ? { ...x, q: e.target.value } : x) })} className={field} />
            <textarea value={f.a} placeholder="Answer" rows={2} onChange={(e) => set({ faqs: draft.faqs.map((x, j) => j === i ? { ...x, a: e.target.value } : x) })} className={`${field} resize-none mt-2`} />
          </Row>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, onAdd, children }: { title: string; onAdd?: () => void; children: React.ReactNode }) {
  return (
    <section id={`handbook-${title.toLowerCase().replaceAll(" ","-")}`} className="scroll-mt-6 bg-card rounded-3xl border border-border p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-slate-900 font-semibold text-sm">{title}</h2>
        {onAdd && <button onClick={onAdd} className="text-xs font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ onRemove, children }: { onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 p-3">
      <div className="flex-1">{children}</div>
      <button onClick={onRemove} aria-label="Remove" className="p-1.5 text-slate-400 hover:text-red-600 shrink-0"><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}

function ListSection({ title, items, onChange }: { title: string; items: string[]; onChange: (items: string[]) => void }) {
  return (
    <Section title={title} onAdd={() => onChange([...items, ''])}>
      {items.map((it, i) => (
        <Row key={i} onRemove={() => onChange(items.filter((_, j) => j !== i))}>
          <input value={it} placeholder={`Item ${i + 1}`} onChange={(e) => onChange(items.map((x, j) => j === i ? e.target.value : x))} className={field} />
        </Row>
      ))}
    </Section>
  );
}
