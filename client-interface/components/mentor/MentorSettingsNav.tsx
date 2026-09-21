'use client';

import {
  User,
  Sparkles,
  Palette,
  Users,
  Bell,
  BookOpen,
  KeyRound,
  Shield,
  ChevronRight,
} from 'lucide-react';
const groups = [
  {
    label: 'Your profile',
    items: [
      {
        id: 'profile',
        label: 'Personal details',
        description: 'Photo, contact and professional profile',
        icon: User,
      },
      {
        id: 'skills',
        label: 'Skills & expertise',
        description: 'What you can help mentees learn',
        icon: Sparkles,
      },
      {
        id: 'availability',
        label: 'Mentoring capacity',
        description: 'Availability for new mentees',
        icon: Users,
      },
    ],
  },
  {
    label: 'Your workspace',
    items: [
      {
        id: 'appearance',
        label: 'Display',
        description: 'Light, dark or your device setting',
        icon: Palette,
      },
      {
        id: 'notifications',
        label: 'Notifications',
        description: 'Choose what reaches you',
        icon: Bell,
      },
      {
        id: 'replies',
        label: 'Reply assistance',
        description: 'Auto replies and your knowledge base',
        icon: BookOpen,
      },
      {
        id: 'ai',
        label: 'AI connections',
        description: 'Manage your connected providers',
        icon: KeyRound,
      },
    ],
  },
  {
    label: 'Your account',
    items: [
      {
        id: 'security',
        label: 'Security',
        description: 'Password, sessions and two-factor authentication',
        icon: Shield,
      },
    ],
  },
];
export function MentorSettingsNav({
  activeTab,
  onChange,
}: {
  activeTab: string;
  onChange: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Settings sections"
      className="space-y-5 lg:sticky lg:top-6"
    >
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {group.label}
          </p>
          <div className="flex gap-1 overflow-x-auto lg:flex-col">
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={activeTab === item.id ? 'page' : undefined}
                onClick={() => onChange(item.id)}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors shrink-0 ${activeTab === item.id ? 'bg-brand-600 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium flex-1">{item.label}</span>
                <ChevronRight className="h-3 w-3 hidden lg:block" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
export function settingsSectionDescription(id: string) {
  return groups.flatMap((group) => group.items).find((item) => item.id === id);
}
