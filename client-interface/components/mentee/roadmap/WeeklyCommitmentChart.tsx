'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { useRouter } from 'next/navigation';
import type { DailyLogEntry } from '@/lib/hooks/mentee/useDailyLog';

interface WeeklyCommitmentChartProps {
  entries?: DailyLogEntry[];
}

export function WeeklyCommitmentChart({ entries = [] }: WeeklyCommitmentChartProps) {
  const router = useRouter();

  // Calculate current week dates (Monday to Sunday)
  const today = new Date();
  const currentDayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday...
  const distanceToMonday = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - distanceToMonday);

  const daysOfWeek = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const logByDateKey = new Map(entries.map((e) => [e.dateKey, e]));

  let totalItemsThisWeek = 0;
  let activeDaysThisWeek = 0;

  const formatLocalDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayKey = formatLocalDateKey(today);

  const chartData = daysOfWeek.map((dayLabel, idx) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + idx);
    const dateKey = formatLocalDateKey(d);
    const entry = logByDateKey.get(dateKey);

    const itemsCount = (entry?.tasksDone?.length || 0) + (entry?.slotsDone?.length || 0);
    if (entry) activeDaysThisWeek++;
    totalItemsThisWeek += itemsCount;

    return {
      day: dayLabel,
      dateKey,
      count: itemsCount,
      isToday: dateKey === todayKey,
    };
  });

  return (
    <div className="bg-card rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Weekly Activity & Logs</h3>
        <button
          onClick={() => router.push('/mentee/daily-log')}
          className="text-xs text-brand-600 hover:text-brand-700 font-semibold"
        >
          + Log Today
        </button>
      </div>

      <div className="mb-4">
        <div className="text-2xl font-bold text-slate-900 tabular-nums">
          {activeDaysThisWeek} <span className="text-sm font-normal text-slate-500">of 7 days logged</span>
        </div>
        <div className="text-xs text-emerald-600 font-medium mt-0.5">
          {activeDaysThisWeek > 0
            ? `${totalItemsThisWeek} activities logged this week`
            : 'No logs recorded yet for this week.'}
        </div>
      </div>

      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 12, right: 10, left: -25, bottom: 0 }}>
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 500 }}
            />
            <YAxis hide domain={[0, 'auto']} />
            <Tooltip
              cursor={{ fill: 'rgba(15, 23, 42, 0.03)' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-slate-900 text-white px-2.5 py-1 rounded-lg text-xs shadow-lg font-medium">
                      {data.dateKey}: {data.count} items logged
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="count" fill="#0066ff" radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
