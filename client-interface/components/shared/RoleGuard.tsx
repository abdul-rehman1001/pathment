'use client';

import { useAuth } from '@/lib/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, ReactNode } from 'react';
import { UserRole } from '@/lib/types';
import { Loader2 } from 'lucide-react';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { workspacePath } from '@/lib/services/workspace-scope';

interface RoleGuardProps {
  children: ReactNode;
  allowedRoles: UserRole[];
  redirectTo?: string;
  /** Also permit entry for org/program admin-tier users (scoped RBAC), even if
   *  they lack the `admin` capability. Used by the admin section layout. */
  permitAdminArea?: boolean;
}

export function RoleGuard({ children, allowedRoles, redirectTo = '/login', permitAdminArea = false }: RoleGuardProps) {
  const { user, isLoading, availableRoles, activeRole, setActiveRole, refreshUser } = useAuth();
  const { canAccessAdmin, loading: permsLoading } = usePermissions();
  const router = useRouter();
  // Whether we've already re-checked capabilities with the server this mount.
  const [recheckedCaps, setRecheckedCaps] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // A user may enter a section if any of their capabilities matches it (this is
  // what lets an admin who is also a mentee open the mentee section), OR - for
  // the admin section - if scoped RBAC grants them org/program admin access.
  const roleMatch = !!user && allowedRoles.some((r) => availableRoles.includes(r));
  const adminAllowed = !!user && permitAdminArea && canAccessAdmin;
  const permitted = roleMatch || adminAllowed;
  const sectionRole = allowedRoles[0];
  // For admin-area entry we must wait for the permission fetch before deciding.
  const awaitingPerms = !!user && !roleMatch && permitAdminArea && permsLoading;

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.push(workspacePath(redirectTo));
      return;
    }
    if (permitted) {
      // Keep the active-role view in sync (only when the user truly holds the role).
      if (roleMatch && sectionRole && activeRole !== sectionRole && availableRoles.includes(sectionRole)) {
        setActiveRole(sectionRole);
      }
      return;
    }
    if (awaitingPerms) return; // hold until canAccessAdmin resolves
    // Cached capabilities may be stale - refresh from the server once before redirecting.
    if (!recheckedCaps) {
      setVerifying(true);
      refreshUser().finally(() => { setRecheckedCaps(true); setVerifying(false); });
      return;
    }
    router.push(workspacePath(`/${activeRole || user.role}/dashboard`));
  }, [user, isLoading, permitted, awaitingPerms, recheckedCaps, sectionRole, activeRole, availableRoles, redirectTo, router, setActiveRole, refreshUser, roleMatch]);

  if (isLoading || verifying || awaitingPerms) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!permitted) {
    return null;
  }

  return <>{children}</>;
}
