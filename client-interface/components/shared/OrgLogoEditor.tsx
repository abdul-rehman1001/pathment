'use client';

import { useState } from 'react';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { WorkspaceLogo } from './WorkspaceLogo';
import { ImageCropUploader } from './ImageCropUploader';
import { organizationsApi } from '@/lib/services/organizations-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

/** Same pattern as ClanAvatarEditor — shared ImageCropUploader, org upload API. */
export function OrgLogoEditor({
  name,
  logoUrl,
  canEdit,
  brandingEnabled,
  onChanged,
}: {
  name: string;
  logoUrl?: string | null;
  canEdit: boolean;
  brandingEnabled: boolean;
  onChanged: (logoUrl: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const organization = await organizationsApi.removeLogo();
      onChanged(organization.logoUrl);
      toast.success('Workspace logo removed');
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Could not remove logo'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
      <WorkspaceLogo name={name} src={logoUrl} size="xl" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          Workspace logo <span className="font-normal text-muted-foreground">· optional</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {brandingEnabled
            ? 'PNG or JPG · up to 5 MB. Shown to everyone in this workspace.'
            : 'Custom branding is available on the Growth plan and above.'}
        </p>
        {canEdit && brandingEnabled && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setCropOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              {busy ? 'Updating…' : logoUrl ? 'Change logo' : 'Add logo'}
            </button>
            {logoUrl && (
              <button type="button" disabled={busy} onClick={remove} className="px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50">
                Remove
              </button>
            )}
          </div>
        )}
      </div>

      <ImageCropUploader
        open={cropOpen}
        onClose={() => setCropOpen(false)}
        shape="rectangle"
        aspectRatio={1}
        title="Workspace logo"
        description="PNG or JPG, up to 5 MB. Drag to reposition, slide to zoom."
        successMessage="Workspace logo updated"
        upload={async (blob) => {
          const organization = await organizationsApi.uploadLogo(blob, 'workspace-logo.jpg');
          return organization.logoUrl || undefined;
        }}
        onUploaded={(url) => { if (url) onChanged(url); }}
      />
    </div>
  );
}