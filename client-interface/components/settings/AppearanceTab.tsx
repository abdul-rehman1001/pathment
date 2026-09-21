'use client';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/lib/context/ThemeContext';
const modes: {
  key: ThemeMode;
  label: string;
  description: string;
  Icon: typeof Sun;
}[] = [
  { key: 'light', label: 'Light', description: 'Bright and clear', Icon: Sun },
  {
    key: 'dark',
    label: 'Dark',
    description: 'Gentle in low light',
    Icon: Moon,
  },
  {
    key: 'system',
    label: 'System',
    description: 'Follow your device',
    Icon: Monitor,
  },
];
export function AppearanceTab() {
  const { mode, setMode } = useTheme();
  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground">Display mode</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        One consistent palette. Choose the lighting that works for you.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {modes.map(({ key, label, description, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            aria-pressed={mode === key}
            className={`rounded-2xl border p-5 text-left transition-colors ${mode === key ? 'border-brand-500 bg-muted ring-1 ring-brand-500' : 'border-border bg-card hover:bg-muted'}`}
          >
            <div className="flex items-center justify-between">
              <Icon className="h-6 w-6 text-foreground" />
              {mode === key && (
                <Check className="h-4 w-4 text-brand-600 dark:text-brand-300" />
              )}
            </div>
            <p className="mt-5 font-semibold text-foreground">{label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
export default AppearanceTab;
