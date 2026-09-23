'use client';

import { Drawer } from '@/components/shared/Drawer';

export interface EditableUser {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: 'admin' | 'mentor' | 'mentee';
  twoFactorEnabled?: boolean;
}

/** Shared account identity is read-only for workspace administrators. */
export function EditUserDrawer({ user, onClose }: { user: EditableUser; onClose: () => void; onSaved?: () => void }) {
  return (
    <Drawer open onClose={onClose} title="Account details (read-only)" subtitle={`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email}
      footer={<button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm">Close</button>}
    >
      <div className="space-y-5">
        <p className="text-sm text-slate-600">
          Account details are shared across workspaces. Workspace admins cannot change names, email, account role, passwords, or two-factor authentication, or send password-reset emails.
          The account owner can manage their profile and security in account settings or use password recovery on the sign-in page.
        </p>
        <dl className="space-y-3 text-sm">
          <div><dt className="font-medium">Name</dt><dd>{`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || '—'}</dd></div>
          <div><dt className="font-medium">Email</dt><dd>{user.email || '—'}</dd></div>
          <div><dt className="font-medium">Account role</dt><dd>{user.role || '—'}</dd></div>
        </dl>
        <p className="text-sm text-slate-500">Account role is shared across workspaces. It is separate from workspace access roles.</p>
      </div>
    </Drawer>
  );
}
