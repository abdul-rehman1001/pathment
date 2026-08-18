'use client';

import { X, CheckCircle2, Clock, Award, FileCode, BookOpen, ExternalLink, ArrowRight } from 'lucide-react';
import type { MenteeRoadmapStep } from '@/lib/services/roadmap-api';
import { useRouter } from 'next/navigation';

interface RoadmapMilestoneDetailModalProps {
  step: MenteeRoadmapStep | null;
  onClose: () => void;
}

export function RoadmapMilestoneDetailModal({ step, onClose }: RoadmapMilestoneDetailModalProps) {
  const router = useRouter();

  if (!step) return null;

  const isCompleted = step.done || step.status === 'completed';
  const isCurrent = step.current || step.status === 'current';

  const handleAction = () => {
    onClose();
    if (step.assignedTask?.id) {
      router.push(`/mentee/tasks/${step.assignedTask.id}`);
    } else {
      router.push('/mentee/tasks');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="milestone-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-card w-full max-w-2xl rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/80">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${
                  isCompleted
                    ? 'bg-emerald-100 text-emerald-800'
                    : isCurrent
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {isCompleted ? 'Completed' : isCurrent ? 'In Progress' : 'Upcoming Stage'}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 capitalize">
                {step.type || 'Assignment'}
              </span>
            </div>
            <h2 id="milestone-modal-title" className="text-xl font-bold text-slate-900">{step.title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Metadata Bar */}
          <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 text-center">
            <div>
              <div className="text-[11px] text-slate-500 font-medium">Difficulty</div>
              <div className="text-xs font-bold text-slate-800 capitalize mt-0.5">{step.difficulty || 'Standard'}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 font-medium">Est. Hours</div>
              <div className="text-xs font-bold text-slate-800 mt-0.5">
                {step.estimatedHours != null ? `${step.estimatedHours} hrs` : 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500 font-medium">
                {isCompleted ? 'Points Earned' : 'Base Points'}
              </div>
              <div className={`text-xs font-bold mt-0.5 ${isCompleted ? 'text-emerald-600' : 'text-brand-700'}`}>
                {isCompleted && step.assignedTask?.pointsAwarded != null
                  ? `+${step.assignedTask.pointsAwarded} pts`
                  : step.pointsBase != null
                  ? `${step.pointsBase} pts`
                  : 'N/A'}
              </div>
            </div>
          </div>

          {/* Description */}
          {step.description && (
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">Overview</h4>
              <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>
            </div>
          )}

          {/* Deliverable */}
          {step.deliverable && (
            <div className="p-4 bg-brand-50/50 rounded-xl border border-brand-100">
              <h4 className="text-xs font-bold text-brand-900 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                <FileCode className="w-4 h-4 text-brand-600" />
                Required Deliverable
              </h4>
              <p className="text-xs text-brand-800 leading-relaxed">{step.deliverable}</p>
            </div>
          )}

          {/* Acceptance Criteria */}
          {step.acceptanceCriteria && step.acceptanceCriteria.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">Acceptance Criteria</h4>
              <ul className="space-y-2">
                {step.acceptanceCriteria.map((criterion, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{criterion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Attached Resources */}
          {step.resources && step.resources.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">Learning Resources</h4>
              <div className="space-y-2">
                {step.resources.map((res, idx) => {
                  const rawUrl = res.url?.trim();
                  if (!rawUrl) {
                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
                      >
                        <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate">{res.title}</span>
                      </div>
                    );
                  }
                  const href = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
                    ? rawUrl
                    : `https://${rawUrl}`;
                  return (
                    <a
                      key={idx}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl hover:border-brand-300 hover:bg-brand-50/50 transition-all text-xs font-medium text-slate-800 group"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <BookOpen className="w-4 h-4 text-brand-600 shrink-0" />
                        <span className="truncate">{res.title}</span>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-brand-600 shrink-0" />
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleAction}
            className="px-5 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-xs flex items-center gap-1.5 transition-colors"
          >
            {isCompleted ? 'View Task & Feedback' : 'Go to Task Workspace'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
