'use client';

import { useState, useEffect } from 'react';
import { Zap, AlertTriangle } from 'lucide-react';
import { useAIQuota } from '@/lib/hooks/shared';

/**
 * Reusable, DRY Auto-Reply Quota Card component:
 * - Displays current message count vs monthly limit
 * - Dynamic color-coded usage progress bar
 * - Quota exceeded alert banner
 * - Inline range slider & input for updating limits backed by TanStack Query
 */
export function AutoReplyQuotaCard() {
  const { quota, setQuotaLimit } = useAIQuota();
  const [editingQuota, setEditingQuota] = useState(false);
  const [tempQuotaLimit, setTempQuotaLimit] = useState(100);

  useEffect(() => {
    if (quota) setTempQuotaLimit(quota.limit);
  }, [quota]);

  if (!quota) return null;

  const isExceeded = quota.count >= quota.limit;
  const usagePercentage = Math.min(100, Math.round((quota.count / Math.max(1, quota.limit)) * 100));

  return (
    <div className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-card space-y-3 shadow-xs">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-brand-600 shrink-0" />
          <div>
            <h3 className="font-medium text-sm sm:text-base text-slate-900">
              Monthly Auto-Reply Quota
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Monthly limit on AI automatic responses sent on your behalf.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditingQuota(!editingQuota)}
          className="text-xs font-semibold text-brand-600 hover:text-brand-700 px-3 py-1.5 rounded-lg border border-brand-200 hover:border-brand-300 dark:border-brand-900/50 bg-brand-50/50 dark:bg-brand-500/10 transition-colors"
        >
          {editingQuota ? 'Cancel' : 'Edit Limit'}
        </button>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-slate-700">
            <span className="font-bold text-slate-900">{quota.count.toLocaleString()}</span> of <span className="font-bold text-slate-900">{quota.limit.toLocaleString()}</span> messages used this month
          </span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            isExceeded 
              ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border border-red-200' 
              : usagePercentage > 80
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200'
              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200'
          }`}>
            {isExceeded ? 'Quota Exceeded' : `${usagePercentage}% Used`}
          </span>
        </div>

        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-200 dark:border-slate-700">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isExceeded
                ? 'bg-red-500'
                : usagePercentage > 80
                ? 'bg-amber-500'
                : 'bg-brand-600'
            }`}
            style={{ width: `${usagePercentage}%` }}
          />
        </div>
      </div>

      {isExceeded && (
        <div className="flex items-center gap-2 p-2.5 bg-red-50 dark:bg-red-950/30 border border-red-200 rounded-lg text-xs text-red-700 dark:text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
          <span>You have reached your monthly message quota limit. Increase your limit below to resume auto-replies.</span>
        </div>
      )}

      {editingQuota && (
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600">Set Custom Monthly Limit:</span>
            <span className="font-bold text-slate-900 text-sm">{tempQuotaLimit.toLocaleString()} messages</span>
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-500 font-medium mr-1">Presets:</span>
            {[100, 1000, 10000, 50000, 500000].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setTempQuotaLimit(preset)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  tempQuotaLimit === preset
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {preset >= 100000 ? `${preset / 100000} Lac (${preset.toLocaleString()})` : preset.toLocaleString()}
              </button>
            ))}
          </div>

          {/* Custom Number Input & Slider */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <input
                type="number"
                min="1"
                max="10000000"
                value={tempQuotaLimit}
                onChange={(e) => setTempQuotaLimit(Math.max(1, parseInt(e.target.value, 10) || 1))}
                placeholder="Enter custom limit..."
                className="w-full px-3 py-1.5 bg-background border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              type="button"
              onClick={async () => {
                await setQuotaLimit(tempQuotaLimit);
                setEditingQuota(false);
              }}
              className="px-4 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold shrink-0 shadow-xs transition-colors"
            >
              Save Limit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
