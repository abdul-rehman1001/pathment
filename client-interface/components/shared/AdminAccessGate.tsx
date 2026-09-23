'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock, Loader2 } from 'lucide-react';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { getFlatNavItems } from '@/lib/config/navigation';
import { logicalPathname, workspacePath } from '@/lib/services/workspace-scope';

/**
 * Per-section permission gate for the admin area. The sidebar already HIDES
 * items a partial-permission admin can't use; this stops them from reaching a
 * forbidden section by URL (which would just 403 every fetch) and shows a clean
 * "no access" panel instead. Sections with no required permission are open.
 *
 * Required permission is resolved from the admin nav config, keyed by the
 * "/admin/<section>" prefix, so page detail routes inherit their section's gate.
 */

// "/admin/<section>" → required permission (built once from the nav config).
const SECTION_PERMISSION: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const item of getFlatNavItems('admin')) {
    if (!item.permission) continue;
    const section = item.path.split('/').slice(0, 3).join('/'); // e.g. /admin/users
    // First permission wins; siblings in a section share the same gate.
    if (!map[section]) map[section] = item.permission;
  }
  return map;
})();

function sectionOf(pathname: string): string {
  return '/' + pathname.split('/').filter(Boolean).slice(0, 2).join('/'); // /admin/<seg>
}

export function AdminAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = logicalPathname(usePathname());
  const { can, canAccessAdmin, loading } = usePermissions();

  const required = useMemo(() => SECTION_PERMISSION[sectionOf(pathname || '')], [pathname]);

  // No specific permission for this section (e.g. library, mentor-spec, the
  // /admin landing) → the area-level RoleGuard already cleared them.
  if (!required) return <>{children}</>;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  if (can(required)) return <>{children}</>;

  // Permitted in the admin area generally, but not THIS section.
  const fallback = canAccessAdmin ? '/admin/dashboard' : '/';
  return (
    <div className="max-w-lg mx-auto py-20 text-center">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
        <Lock className="w-6 h-6 text-slate-400" />
      </div>
      <h1 className="text-slate-900 text-lg font-semibold mb-1">You don&apos;t have access to this section</h1>
      <p className="text-slate-500 text-sm mb-5">
        Your role doesn&apos;t include the permission this page needs. Ask an admin to grant it
        under Roles &amp; Access, or head back to a section you can use.
      </p>
      <Link
        href={workspacePath(fallback)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
      >
        Go back
      </Link>
    </div>
  );
}
