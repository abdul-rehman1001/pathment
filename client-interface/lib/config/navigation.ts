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
}

export const navigationConfig: Record<string, NavLink[]> = {
  admin: [
    { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard', permission: 'analytics.view' },
    { path: '/admin/messages', icon: MessageSquare, label: 'Messages', badge: 'messages' },
    {
      path: 'group:admissions', icon: CalendarRange, label: 'Admissions',
      children: [
        { path: '/admin/cohorts', icon: CalendarRange, label: 'Intake', permission: 'intake.manage' },
        { path: '/admin/assessments', icon: ClipboardCheck, label: 'Assessments', permission: 'assessment.author' },
        { path: '/admin/invites', icon: UserPlus, label: 'Invites', permission: 'invite.create' },
      ],
    },
    {
      path: 'group:people', icon: Users, label: 'People & Clans',
      children: [
        { path: '/admin/enrollment/overview', icon: Users, label: 'Enrollments', permission: 'mentee.manage' },
        { path: '/admin/clans', icon: Users2, label: 'Clans', permission: 'clan.create' },
        { path: '/admin/users/mentors', icon: GraduationCap, label: 'Mentors', permission: 'user.manage' },
        { path: '/admin/users/mentees', icon: School, label: 'Mentees', permission: 'user.manage' },
        { path: '/admin/requests', icon: GitPullRequest, label: 'Clan Requests', permission: 'mentee.manage' },
        { path: '/admin/promotions', icon: TrendingUp, label: 'Promotions', permission: 'user.manage' },
        { path: '/admin/top-performers', icon: Trophy, label: 'Top Performers', permission: 'user.manage' },
      ],
    },
    {
      path: 'group:programs', icon: BookOpen, label: 'Programs',
      children: [
        { path: '/admin/programs/list', icon: BookOpen, label: 'Programs', permission: 'program.manage' },
        { path: '/admin/roadmaps', icon: Route, label: 'Roadmaps', permission: 'roadmap.author' },
        { path: '/admin/schedules', icon: CalendarClock, label: 'Schedules', permission: 'program.manage' },
        { path: '/admin/certificates', icon: Award, label: 'Certificates', permission: 'program.manage' },
      ],
    },
    {
      path: 'group:engagement', icon: Megaphone, label: 'Engagement',
      children: [
        { path: '/admin/announcements', icon: Megaphone, label: 'Announcements', permission: 'community.moderate' },
        { path: '/admin/meetings', icon: Video, label: 'Live Meetings', permission: 'analytics.view' },
        { path: '/admin/changelog', icon: PackageOpen, label: "What's New", permission: 'system.settings' },
        { path: '/admin/rewards', icon: Gift, label: 'Rewards', permission: 'gamification.manage' },
        { path: '/admin/moderation', icon: ShieldAlert, label: 'Moderation', permission: 'community.moderate' },
        { path: '/admin/feedback', icon: MessageSquarePlus, label: 'Feedback', permission: 'feedback.manage' },
      ],
    },
    {
      path: 'group:analytics', icon: TrendingUp, label: 'Analytics',
      children: [
        { path: '/admin/insights', icon: TrendingUp, label: 'Insights', permission: 'analytics.view' },
        { path: '/admin/review-records', icon: CalendarRange, label: 'Review Records', permission: 'analytics.view' },
        { path: '/admin/activity', icon: BarChart2, label: 'Activity', permission: 'analytics.view' },
        { path: '/admin/emails', icon: Mail, label: 'Email Queue', permission: 'system.settings' },
      ],
    },
    { path: '/admin/access', icon: ShieldCheck, label: 'Roles & Access', permission: 'access.manage' },
    { path: '/admin/library', icon: BookOpen, label: 'Library' },
    { path: '/admin/mentor-spec', icon: Compass, label: 'Mentor Handbook' },
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
