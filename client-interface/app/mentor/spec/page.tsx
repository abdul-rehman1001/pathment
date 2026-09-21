'use client';

import { useState } from 'react';
import {
  Compass,
  ShieldCheck,
  ChevronDown,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useMentorSpec } from '@/lib/hooks/shared/useMentorSpec';

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-200 rounded-xl">
      <button
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-slate-900">{q}</span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <p className="px-4 pb-4 text-sm text-slate-600">{a}</p>}
    </div>
  );
}

export default function MentorSpec() {
  const { spec, loading } = useMentorSpec();

  if (loading || !spec) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="rounded-3xl border border-border bg-card p-6 sm:p-8">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand-700 dark:text-brand-300 mb-3">
          <Compass className="w-4 h-4" />
          Your mentoring field guide
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mb-2">Mentor handbook</h1>
        <p className="text-slate-600">{spec.intro}</p>
      </div>

      <nav aria-label="Handbook sections" className="flex flex-wrap gap-2">
        {[
          ['principles', 'Principles'],
          ['expectations', 'Responsibilities'],
          ['questions', 'Common questions'],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-brand-400"
          >
            {label}
          </a>
        ))}
      </nav>
      {spec.principles.length > 0 && (
        <div id="principles" className="grid gap-4 sm:grid-cols-2 scroll-mt-6">
          {spec.principles.map((p, i) => (
            <div
              key={i}
              className="bg-card rounded-2xl border border-slate-200 p-5"
            >
              <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center mb-3">
                <Compass className="w-4 h-4 text-brand-600" />
              </div>
              <h3 className="font-medium text-slate-900">{p.title}</h3>
              <p className="text-sm text-slate-600 mt-1">{p.body}</p>
            </div>
          ))}
        </div>
      )}

      {spec.time.length > 0 && (
        <div className="grid sm:grid-cols-3 gap-3">
          {spec.time.map((t, i) => (
            <div
              key={i}
              className="bg-card rounded-2xl border border-slate-200 p-5 text-center"
            >
              <div className="text-2xl font-semibold text-brand-700 tabular-nums">
                {t.value}
              </div>
              <div className="text-xs text-slate-500 mt-1">{t.label}</div>
            </div>
          ))}
        </div>
      )}

      <div id="expectations" className="grid gap-4 lg:grid-cols-2 scroll-mt-6">
        {spec.responsibilities.length > 0 && (
          <div className="bg-card rounded-2xl border border-slate-200 p-6">
            <h2 className="text-slate-900 mb-3">Your responsibilities</h2>
            <ul className="space-y-2">
              {spec.responsibilities.map((r, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-slate-700"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
        {spec.conduct.length > 0 && (
          <div className="bg-card rounded-2xl border border-slate-200 p-6">
            <h2 className="text-slate-900 mb-3">Code of conduct</h2>
            <ul className="space-y-2">
              {spec.conduct.map((c, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-slate-700"
                >
                  <ShieldCheck className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {spec.faqs.length > 0 && (
        <div
          id="questions"
          className="scroll-mt-6 rounded-3xl border border-border bg-card p-6"
        >
          <h2 className="text-slate-900 mb-3">Common questions</h2>
          <div className="space-y-2">
            {spec.faqs.map((f, i) => (
              <FaqItem key={i} {...f} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
