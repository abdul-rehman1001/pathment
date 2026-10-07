'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, Loader2, RefreshCw, X, ZoomIn } from 'lucide-react';
import { toast } from 'sonner';
import { WorkspaceLogo } from './WorkspaceLogo';
import { organizationsApi } from '@/lib/services/organizations-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

/**
 * Admin workspace logo editor. Same square crop / pan / zoom pattern as clan
 * and profile photos. Upload is plan-gated server-side (customBranding).
 */

const ACCEPT = 'image/png,image/jpeg';
const MAX_BYTES = 5 * 1024 * 1024;
const VIEW = 264;
const OUT = 512;
const MAX_ZOOM = 3;

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
          Workspace logo{' '}
          <span className="font-normal text-muted-foreground">· optional</span>
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
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>
      {cropOpen && (
        <OrgLogoCropper
          onClose={() => setCropOpen(false)}
          onUploaded={(url) => {
            onChanged(url);
            setCropOpen(false);
          }}
        />
      )}
    </div>
  );
}

function OrgLogoCropper({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: (url: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [uploading, setUploading] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => () => { if (imageSrc) URL.revokeObjectURL(imageSrc); }, [imageSrc]);

  const baseScale = nat ? Math.max(VIEW / nat.w, VIEW / nat.h) : 1;
  const scale = baseScale * zoom;
  const dispW = nat ? nat.w * scale : 0;
  const dispH = nat ? nat.h * scale : 0;

  const clampOffset = useCallback(
    (x: number, y: number) => ({
      x: Math.min(0, Math.max(VIEW - dispW, x)),
      y: Math.min(0, Math.max(VIEW - dispH, y)),
    }),
    [dispW, dispH],
  );

  const onPickFile = (file?: File | null) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast.error('Please choose a PNG or JPG image');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('That image is over 5 MB — please pick a smaller one');
      return;
    }
    const url = URL.createObjectURL(file);
    setImageSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
    setZoom(1);
  };

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    imgRef.current = el;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    setNat({ w, h });
    const s = Math.max(VIEW / w, VIEW / h);
    setOffset({ x: (VIEW - w * s) / 2, y: (VIEW - h * s) / 2 });
  };

  useEffect(() => {
    if (nat) setOffset((o) => clampOffset(o.x, o.y));
  }, [zoom, nat, clampOffset]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!nat) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset(clampOffset(drag.current.ox + (e.clientX - drag.current.x), drag.current.oy + (e.clientY - drag.current.y)));
  };
  const onPointerUp = () => { drag.current = null; };
  const onWheel = (e: React.WheelEvent) => {
    if (!nat) return;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(1, z - e.deltaY * 0.0015)));
  };

  const save = async () => {
    if (!imgRef.current || !nat) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sx = -offset.x / scale;
    const sy = -offset.y / scale;
    const sSize = VIEW / scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgRef.current, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.92));
    if (!blob) { toast.error('Could not process the image'); return; }
    try {
      setUploading(true);
      const organization = await organizationsApi.uploadLogo(blob);
      toast.success('Workspace logo updated');
      onUploaded(organization.logoUrl);
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Could not upload workspace logo'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => { if (!uploading) onClose(); }} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">Workspace logo</h3>
            <p className="mt-0.5 text-sm text-slate-500">Drag to reposition, slide to zoom.</p>
          </div>
          <button type="button" onClick={() => !uploading && onClose()} className="shrink-0 text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!imageSrc ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 py-12 text-slate-500 transition-colors hover:border-brand-400 hover:bg-brand-50/40"
          >
            <ImagePlus className="h-8 w-8 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">Choose a logo</span>
            <span className="text-xs text-slate-400">PNG or JPG · max 5 MB</span>
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div
                className="relative cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-slate-100 active:cursor-grabbing"
                style={{ width: VIEW, height: VIEW }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                onWheel={onWheel}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Crop preview"
                  onLoad={onImgLoad}
                  draggable={false}
                  className="pointer-events-none absolute max-w-none"
                  style={{ left: offset.x, top: offset.y, width: dispW || undefined, height: dispH || undefined }}
                />
                <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-slate-900/10" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ZoomIn className="h-4 w-4 shrink-0 text-slate-400" />
              <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-brand-600" />
              <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
                <RefreshCw className="h-3.5 w-3.5" />Replace
              </button>
            </div>
          </div>
        )}

        <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ''; }} />

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => !uploading && onClose()} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Cancel</button>
          <button
            type="button"
            onClick={save}
            disabled={!imageSrc || uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save logo
          </button>
        </div>
      </div>
    </div>
  );
}
