'use client';

import { ShieldAlert, Loader2, Flag, Trash2, CheckCircle2, XCircle, FileText, MessageCircle } from 'lucide-react';
import { useModeration, type ReportStatus } from '@/lib/hooks/admin';

const STATUS_TABS: { key: ReportStatus; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'dismissed', label: 'Dismissed' },
];

function timeAgo(iso: string) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function AdminModerationPage() {
  const { reports, status, setStatus, loading, resolve, removeContent } = useModeration();

  return (
    <div className="space-y-6">
      <div className="admin-page-heading flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-slate-900 mb-1 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-brand-600" /> Moderation
          </h1>
          <p className="text-slate-600">Review content members flagged across community spaces.</p>
        </div>
        <div className="flex gap-1 bg-card border border-slate-200 rounded-xl p-1">
          {STATUS_TABS.map((t) => (
            <button key={t.key} onClick={() => setStatus(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${status === t.key ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-brand-500" /></div>
      ) : reports.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 py-16 text-center">
          <ShieldAlert className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No {status} reports.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="bg-card rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
                  {r.targetType === 'post' ? <FileText className="w-3 h-3" /> : <MessageCircle className="w-3 h-3" />}{r.targetType}
                </span>
                {r.targetDeleted && <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600">already removed</span>}
                <span className="text-slate-400 ml-auto">{timeAgo(r.at)}</span>
              </div>

              <p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-xl p-3 border border-slate-100">
                {r.preview || '(no preview)'}
              </p>
              <p className="mt-2 text-xs text-slate-400">by {r.targetAuthor || 'unknown'}</p>

              <div className="mt-3 flex items-start gap-1.5 text-sm text-slate-600">
                <Flag className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
                <span><span className="font-medium text-slate-700">{r.reporter.name}</span> reported{r.reason ? `: ${r.reason}` : ' this'}</span>
              </div>

              {r.status === 'open' && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {!r.targetDeleted && (
                    <button onClick={() => removeContent(r)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white">
                      <Trash2 className="w-3.5 h-3.5" /> Remove content
                    </button>
                  )}
                  <button onClick={() => resolve(r.id, 'reviewed')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Mark reviewed
                  </button>
                  <button onClick={() => resolve(r.id, 'dismissed')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50">
                    <XCircle className="w-3.5 h-3.5" /> Dismiss
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
