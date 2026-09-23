'use client';

import { useAuth } from '@/lib/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { workspacePath } from '@/lib/services/workspace-scope';

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.replace(workspacePath('/login'));
      } else {
        const available = user.capabilities ?? [user.role];
        const role = available.includes('admin') ? 'admin'
          : available.includes('mentor') ? 'mentor'
          : available.includes('mentee') ? 'mentee' : null;
        router.replace(workspacePath(role ? `/${role}/dashboard` : '/workspaces'));
      }
    }
  }, [user, isLoading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
