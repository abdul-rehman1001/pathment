'use client';

import { useState } from 'react';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { ClanAvatar } from './ClanAvatar';
import { ImageCropUploader } from './ImageCropUploader';
import { apiClient } from '@/lib/services/api-client';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { qk, useInvalidate } from '@/lib/query';

/**
 * Clan photo field + crop modal. Uses ImageCropUploader with a circular crop
 * (same as profile photos). Organisation logos will use `shape="rectangle"`
 * on the shared cropper when that feature lands — not this wrapper.
 */

export function ClanAvatarEditor({
  clanId,
  name,
  avatarUrl,
  onChanged,
}: {
  clanId: string;
  name: string;
  avatarUrl?: string | null;
  onChanged: (avatarUrl: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const invalidate = useInvalidate();

  async function remove() {
    setBusy(true);
    try {
      await apiClient.delete(`/clans/${clanId}/avatar`);
      onChanged(null);
      void invalidate(qk.clan.all);
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Could not remove photo'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-card p-4">
      <ClanAvatar name={name} src={avatarUrl} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">
          Clan photo{' '}
          <span className="font-normal text-slate-500">· optional</span>
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          PNG or JPG · up to 5 MB. Crop and zoom so it fills the circle.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setCropOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Camera className="w-4 h-4" />
            {busy ? 'Updating…' : avatarUrl ? 'Change photo' : 'Add photo'}
          </button>
          {avatarUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="px-2 py-1.5 text-sm text-slate-500 hover:text-slate-700 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <ImageCropUploader
        open={cropOpen}
        onClose={() => setCropOpen(false)}
        shape="circle"
        title="Clan photo"
        description="PNG or JPG, up to 5 MB. Drag to reposition, slide to zoom."
        successMessage="Clan photo updated"
        upload={async (blob) => {
          const body = new FormData();
          body.append('file', blob, 'clan-avatar.jpg');
          const result = await apiClient.post<{ data: { avatarUrl: string } }>(
            `/clans/${clanId}/avatar`,
            body
          );
          const url = result?.data?.avatarUrl;
          if (!url) throw new Error('Could not upload clan photo');
          return url;
        }}
        onUploaded={(url) => {
          if (!url) return;
          onChanged(url);
          void invalidate(qk.clan.all);
        }}
      />
    </div>
  );
}
