import { Rocket, Calendar } from 'lucide-react';

interface RoadmapHeaderStatsProps {
  percent: number;
  currentPhaseName: string;
  nextMilestoneTitle: string;
  nextMilestoneDue: string;
  totalSteps?: number;
  completedStepsCount?: number;
}

export function RoadmapHeaderStats({
  percent = 0,
  currentPhaseName,
  nextMilestoneTitle,
  nextMilestoneDue,
  totalSteps,
  completedStepsCount,
}: RoadmapHeaderStatsProps) {
  // SVG Ring Progress Calculations
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* 1. Overall Progress Ring */}
      <div className="bg-card rounded-2xl border border-slate-200 p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
          <svg className="w-14 h-14 transform -rotate-90" viewBox="0 0 60 60">
            <circle
              cx="30"
              cy="30"
              r={radius}
              stroke="currentColor"
              strokeWidth="5"
              className="text-slate-100"
              fill="transparent"
            />
            <circle
              cx="30"
              cy="30"
              r={radius}
              stroke="currentColor"
              strokeWidth="5"
              className="text-brand-600 transition-all duration-700 ease-out"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute text-xs font-bold text-slate-900">{percent}%</span>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Overall progress</div>
          <div className="text-xs font-semibold text-slate-700 mt-1 truncate">
            {completedStepsCount != null && totalSteps != null
              ? `${completedStepsCount} of ${totalSteps} steps completed`
              : percent === 100
                ? 'Roadmap Complete! 🎉'
                : 'Keep going!'}
          </div>
        </div>
      </div>

      {/* 2. Current Stage */}
      <div className="bg-card rounded-2xl border border-slate-200 p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="w-11 h-11 rounded-full bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
          <Rocket className="w-5 h-5 text-brand-600" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Current stage</div>
          <div className="text-sm font-bold text-slate-900 truncate mt-0.5" title={currentPhaseName}>
            {currentPhaseName}
          </div>
          <div className="text-xs text-slate-500 truncate">Active Step</div>
        </div>
      </div>

      {/* 3. Next Milestone */}
      <div className="bg-card rounded-2xl border border-slate-200 p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="w-11 h-11 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <Calendar className="w-5 h-5 text-blue-600" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Next milestone</div>
          <div className="text-sm font-bold text-slate-900 truncate mt-0.5" title={nextMilestoneTitle}>
            {nextMilestoneTitle}
          </div>
          <div className="text-xs text-slate-500 truncate">Due {nextMilestoneDue}</div>
        </div>
      </div>
    </div>
  );
}
