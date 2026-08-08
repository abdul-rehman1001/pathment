'use client';

import { useEffect, useState } from 'react';
import { ClipboardCheck, Loader2, Plus } from 'lucide-react';

import { assessmentApi, type Assessment } from '@/lib/services/assessment-api';
import { AssessmentDrawer } from '@/components/admin/AssessmentDrawer';

const STATUS_CLS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  archived: 'bg-slate-100 text-slate-400 border-slate-200',
};

export default function AdminAssessmentsPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    assessmentApi
      .list()
      .then(setAssessments)
      .catch(() => setError('Could not load assessments.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openNew = () => { setEditId(null); setBuilderOpen(true); };
  const openEdit = (id: string) => { setEditId(id); setBuilderOpen(true); };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 mb-2">Assessments</h1>
          <p className="text-slate-600">Build mixed-type assessments (quiz, text, file, link) and attach them to a cohort&apos;s intake.</p>
        </div>
        <button onClick={openNew} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 shrink-0">
          <Plus className="w-4 h-4" /> New assessment
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-brand-600" /></div>
      ) : error ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <p className="text-slate-600 mb-3">{error}</p>
          <button onClick={load} className="text-brand-600 hover:text-brand-700 text-sm font-medium">Try again</button>
        </div>
      ) : assessments.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 mb-3">No assessments yet. Create one to add to an intake.</p>
          <button onClick={openNew} className="text-brand-600 hover:text-brand-700 text-sm font-medium">+ New assessment</button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {assessments.map((a) => (
            <button key={a.id} onClick={() => openEdit(a.id)} className="group text-left block rounded-2xl border border-slate-200 bg-card p-5 hover:border-brand-300 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-slate-900">{a.title}</p>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium shrink-0 capitalize ${STATUS_CLS[a.status] || STATUS_CLS.draft}`}>{a.status}</span>
              </div>
              {a.description && <p className="mt-1.5 text-sm text-slate-500 line-clamp-2">{a.description}</p>}
              <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                <span>{a.questionCount ?? 0} questions</span>
                <span>{a.totalPoints ?? 0} pts</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <AssessmentDrawer
        open={builderOpen}
        assessmentId={editId}
        onClose={() => setBuilderOpen(false)}
        onSaved={load}
        onDeleted={load}
      />
    </div>
  );
}
