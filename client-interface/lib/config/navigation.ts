import { adminWorkspaces } from './adminWorkspaces';
import { menteeWorkspaces } from './menteeWorkspaces';
import { 
  LayoutDashboard,
  BookOpen,
  Users,
  Users2,
  ClipboardList,
  ClipboardCheck,
  AlertTriangle,
  Route,
  CalendarClock,
  CalendarCheck,
  CalendarRange,
  TrendingUp,
  Trophy,
  Gauge,
  Gift,
  FileText,
  Compass,
  Megaphone,
  MessageSquarePlus,
  GitPullRequest,
  MessageSquare,
  UserPlus,
  ShieldCheck,
  Settings,
  GraduationCap,
  School,
  BarChart2,
  ShieldAlert,
  Flag,
  Mail,
  PackageOpen,
  Mic,
  ListChecks,
  Video,
  Award,
  type LucideIcon
} from 'lucide-react';
import { mentorWorkspaces } from './mentorWorkspaces';
import { UserRole } from '@/lib/types';

export interface NavChildLink {
  path: string;
  icon: LucideIcon;
  label: string;
  permission?: string;
}

export interface NavLink {
  path: string;
  icon: LucideIcon;
  label: string;
  badge?: 'messages' | 'approvals';
  permission?: string;
  anyOf?: string[];
  requiresAdminArea?: boolean;
  children?: NavChildLink[];
  activePaths?: string[];
  workspace?: boolean;
  preferenceKey?: string;
}

export const navigationConfig: Record<string, NavLink[]> = {
  admin: [
    { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Overview', permission: 'analytics.view' },
    ...adminWorkspaces.map((workspace) => {
      const icon = ({ Admissions: CalendarRange, People: Users, Learning: BookOpen, Recognition: Trophy, Community: MessageSquarePlus, Insights: BarChart2, Administration: Settings } as Record<string, LucideIcon>)[workspace.label];
      return { path: `group:admin-${workspace.label.toLowerCase()}`, label: workspace.label, icon, workspace: true,
        children: workspace.tabs.map((tab) => ({ path: tab.href, label: tab.label, permission: tab.permission, icon })) };
    }),
    { path: '/admin/messages', icon: MessageSquare, label: 'Messages', badge: 'messages' },
    { path: '/admin/settings', icon: Settings, label: 'Settings', permission: 'system.settings' },
  ],
  mentor: [
    { path: '/mentor/dashboard', icon: LayoutDashboard, label: 'Cockpit' },
    { path: '/mentor/review', icon: CalendarRange, label: 'Clan Review' },
    { path: '/mentor/messages', icon: MessageSquare, label: 'Messages', badge: 'messages' },
    { path: '/mentor/approvals', icon: ClipboardCheck, label: 'Approvals', badge: 'approvals' },
    ...mentorWorkspaces.map((workspace) => ({
      path: workspace.tabs[0].href,
      label: workspace.label,
      icon: ({ 'My mentees': Users2, Curriculum: BookOpen, Recognition: Trophy, Insights: BarChart2, Community: Users } as Record<string, LucideIcon>)[workspace.label],
      activePaths: workspace.tabs.map((tab) => tab.href),
    })),
    { path: '/mentor/schedules', icon: CalendarClock, label: 'Schedule' },
    { path: '/mentor/spec', icon: Compass, label: 'Mentor Handbook' },
    { path: '/mentor/settings', icon: Settings, label: 'Settings' },
  ],
  mentee: [
    { path: '/mentee/dashboard', icon: LayoutDashboard, label: 'This Week' },
    ...menteeWorkspaces.map((workspace) => ({
      path: workspace.tabs[0].href,
      label: workspace.label,
      icon: ({ 'My learning': BookOpen, 'My progress': BarChart2, 'My support': CalendarClock, Community: Users } as Record<string, LucideIcon>)[workspace.label],
      activePaths: workspace.tabs.map((tab) => tab.href),
    })),
    { path: '/mentee/messages', icon: MessageSquare, label: 'Messages', badge: 'messages' },
    { path: '/mentee/settings', icon: Settings, label: 'Settings' },
  ],
} as const;

export function getNavigationLinks(role: UserRole): NavLink[] {
  return navigationConfig[role] || [];
}

export interface FlatNavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  group?: string;
  permission?: string;
  anyOf?: string[];
  requiresAdminArea?: boolean;
}

export function getFlatNavItems(role: UserRole): FlatNavItem[] {
  const links = navigationConfig[role] || [];
  const out: FlatNavItem[] = [];
  for (const link of links) {
    if (link.children) {
      for (const child of link.children) {
        out.push({ path: child.path, label: child.label, icon: child.icon, group: link.label, permission: child.permission });
      }
    } else {
      out.push({
        path: link.path, label: link.label, icon: link.icon,
        permission: link.permission, anyOf: link.anyOf, requiresAdminArea: link.requiresAdminArea,
      });
    }
  }
  if (role === 'mentor' || role === 'mentee') {
    for (const workspace of role === 'mentor' ? mentorWorkspaces : menteeWorkspaces) {
      const icon = links.find((link) => link.path === workspace.tabs[0].href)!.icon;
      for (const tab of workspace.tabs) {
        const existing = out.find((item) => item.path === tab.href);
        if (existing) { existing.label = tab.label; existing.group = workspace.label; }
        else out.push({ path: tab.href, label: tab.label, icon, group: workspace.label });
      }
    }
  }
  return out;
}
