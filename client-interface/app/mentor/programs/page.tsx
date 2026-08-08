'use client';

import Link from 'next/link';
import { BookOpen, Users, Users2, ChevronRight, Loader2, Crown } from 'lucide-react';
import { useMentorPrograms } from '@/lib/hooks/mentor';
import { StatusBadge } from '@/components/admin/ui';

export default function MentorProgramsPage() {
  const { programs, loading } = useMentorPrograms();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-slate-900 mb-2">My programs</h1>
        <p className="text-slate-600">Programs you are mentoring in</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
        </div>
      ) : programs.length === 0 ? (
        <div className="bg-card rounded-2xl border border-slate-200 p-12 text-center">
          <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-slate-900 mb-2">No Programs Yet</h3>
          <p className="text-slate-600">You haven't been assigned to any programs yet.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {programs.map((program) => (
            <Link
              key={program.id}
              href={`/mentor/programs/${program.id}`}
              className="bg-card rounded-2xl border border-slate-200 p-6 hover:border-brand-300 hover:shadow-lg transition-all group flex flex-col"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-5 h-5 text-brand-600" />
                </div>
                <StatusBadge status={program.status || 'active'} noIcon />
              </div>

              {/* Name & Description */}
              <h3 className="text-slate-900 group-hover:text-brand-600 transition-colors mb-1">
                {program.name}
              </h3>
              <p className="text-slate-500 text-sm line-clamp-2 mb-4 flex-1">
                {program.description || 'No description available'}
              </p>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500">Mentees</span>
                  </div>
                  <span className="text-slate-900 font-semibold">{program.menteeCount}</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Users2 className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-500">My clans</span>
                  </div>
                  <span className="text-slate-900 font-semibold">{program.clanCount}</span>
                </div>
              </div>

              {/* Clans I run */}
              {program.clans.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {program.clans.map((c) => (
                    <span key={c.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-50 text-brand-600 rounded-md text-xs">
                      {c.myRole === 'lead_mentor' && <Crown className="w-3 h-3 text-amber-500" />}
                      {c.name}
                      <span className="text-brand-400">· {c.menteeCount}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* CTA */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <span className="text-sm text-brand-600 font-medium group-hover:underline">
                  View Program
                </span>
                <ChevronRight className="w-4 h-4 text-brand-600" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
