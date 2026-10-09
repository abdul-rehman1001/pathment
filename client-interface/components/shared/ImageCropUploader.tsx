'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Loader2, RefreshCw, X, ZoomIn } from 'lucide-react';
import { toast } from 'sonner';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

/**
 * Shared crop / pan / zoom modal for profile photos, clan avatars, and (later)
 * organisation logos.
 *
 * - `circle`  → square cover crop, circular preview (profile + clan)
 * - `rectangle` → cover crop at `aspectRatio`, rounded-rect preview (org logos)
 *
 * Domain upload APIs stay in the caller via `upload` — this component only
 * handles picking, cropping, and exporting a JPEG blob.
 */

export type ImageCropShape = 'circle' | 'rectangle';

const ACCEPT = 'image/png,image/jpeg';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ZOOM = 3;
const CIRCLE_VIEW = 264;
const CIRCLE_OUT = 512;
const RECT_VIEW_W = 320;
const RECT_OUT_W = 1024;

export interface ImageCropUploaderProps {
  open: boolean;
  onClose?: () => void;
  /**
   * Receive the cropped JPEG blob, upload it, and return the stored URL when
   * available (used for `onUploaded`). Throw / reject on failure.
   */
  upload: (blob: Blob) => Promise<string | void>;
  onUploaded?: (url: string) => void;
  title?: string;
  description?: string;
  /** Required mode (e.g. onboarding): no close / cancel — must upload. */
  required?: boolean;
  /** Circle for people/clan; rectangle for org logos. Default: circle. */
  shape?: ImageCropShape;
  /**
   * Width ÷ height for rectangle crops. Ignored for circle.
   * Default `2` (2:1) — a typical horizontal logo frame.
   */
  aspectRatio?: number;
  accept?: string;
  maxBytes?: number;
  successMessage?: string;
  saveLabel?: string;
  requiredSaveLabel?: string;
}

function viewSize(shape: ImageCropShape, aspectRatio: number) {
  if (shape === 'circle') return { w: CIRCLE_VIEW, h: CIRCLE_VIEW };
  const ar = aspectRatio > 0 ? aspectRatio : 2;
  return { w: RECT_VIEW_W, h: Math.max(1, Math.round(RECT_VIEW_W / ar)) };
}

function outSize(shape: ImageCropShape, aspectRatio: number) {
  if (shape === 'circle') return { w: CIRCLE_OUT, h: CIRCLE_OUT };
  const ar = aspectRatio > 0 ? aspectRatio : 2;
  return { w: RECT_OUT_W, h: Math.max(1, Math.round(RECT_OUT_W / ar)) };
}

export function ImageCropUploader({
  open,
  onClose,
  upload,
  onUploaded,
  title = 'Upload image',
  description = 'PNG or JPG, up to 5 MB. Drag to reposition, slide to zoom.',
  required = false,
  shape = 'circle',
  aspectRatio = 2,
  accept = ACCEPT,
  maxBytes = MAX_BYTES,
  successMessage = 'Image updated',
  saveLabel = 'Save photo',
  requiredSaveLabel = 'Save & continue',
}: ImageCropUploaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [uploading, setUploading] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const { w: viewW, h: viewH } = useMemo(
    () => viewSize(shape, aspectRatio),
    [shape, aspectRatio]
  );
  const { w: outW, h: outH } = useMemo(
    () => outSize(shape, aspectRatio),
    [shape, aspectRatio]
  );

  const frameClass =
    shape === 'circle' ? 'rounded-full' : 'rounded-xl';

  // Reset when the dialog closes.
  useEffect(() => {
    if (!open) {
      setImageSrc((s) => {
        if (s) URL.revokeObjectURL(s);
        return null;
      });
      setNat(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setUploading(false);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc);
    };
  }, [imageSrc]);

  const baseScale = nat ? Math.max(viewW / nat.w, viewH / nat.h) : 1;
  const scale = baseScale * zoom;
  const dispW = nat ? nat.w * scale : 0;
  const dispH = nat ? nat.h * scale : 0;

  const clampOffset = useCallback(
    (x: number, y: number) => ({
      x: Math.min(0, Math.max(viewW - dispW, x)),
      y: Math.min(0, Math.max(viewH - dispH, y)),
    }),
    [dispW, dispH, viewW, viewH]
  );

  const onPickFile = (file?: File | null) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast.error('Please choose a PNG or JPG image');
      return;
    }
    if (file.size > maxBytes) {
      toast.error(`That image is over ${Math.round(maxBytes / (1024 * 1024))} MB — please pick a smaller one`);
      return;
    }
    const url = URL.createObjectURL(file);
    setImageSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setZoom(1);
  };

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    imgRef.current = el;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    setNat({ w, h });
    const s = Math.max(viewW / w, viewH / h);
    setOffset({ x: (viewW - w * s) / 2, y: (viewH - h * s) / 2 });
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
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    setOffset(clampOffset(drag.current.ox + dx, drag.current.oy + dy));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!nat) return;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(1, z - e.deltaY * 0.0015)));
  };

  const save = async () => {
    if (!imgRef.current || !nat) return;
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sx = -offset.x / scale;
    const sy = -offset.y / scale;
    const sW = viewW / scale;
    const sH = viewH / scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgRef.current, sx, sy, sW, sH, 0, 0, outW, outH);
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob(res, 'image/jpeg', 0.92)
    );
    if (!blob) {
      toast.error('Could not process the image');
      return;
    }
    try {
      setUploading(true);
      const url = await upload(blob);
      toast.success(successMessage);
      // Always notify on success so callers with side effects (e.g. onboarding
      // navigation) still run even if they ignore the URL argument.
      onUploaded?.(typeof url === 'string' ? url : '');
      onClose?.();
    } catch (error) {
      toast.error(extractApiErrorMessage(error, 'Could not upload the image'));
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  const hint =
    shape === 'circle'
      ? 'The circle shows what will be saved.'
      : 'The frame shows what will be saved.';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={() => {
          if (!required && !uploading) onClose?.();
        }}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <p className="mt-0.5 text-sm text-slate-500">
              {description} {hint}
            </p>
          </div>
          {!required && (
            <button
              type="button"
              onClick={() => !uploading && onClose?.()}
              className="shrink-0 text-slate-400 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {!imageSrc ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 py-12 text-slate-500 transition-colors hover:border-brand-400 hover:bg-brand-50/40"
          >
            <ImagePlus className="h-8 w-8 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">Choose a photo</span>
            <span className="text-xs text-slate-400">
              PNG or JPG · max {Math.round(maxBytes / (1024 * 1024))} MB
            </span>
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div
                className={`relative cursor-grab touch-none select-none overflow-hidden bg-slate-100 active:cursor-grabbing ${frameClass}`}
                style={{ width: viewW, height: viewH }}
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
                  style={{
                    left: offset.x,
                    top: offset.y,
                    width: dispW || undefined,
                    height: dispH || undefined,
                  }}
                />
                <div
                  className={`pointer-events-none absolute inset-0 ring-1 ring-inset ring-slate-900/10 ${frameClass}`}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ZoomIn className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-brand-600"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title="Choose a different photo"
                className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Replace
              </button>
            </div>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            onPickFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <div className="mt-6 flex justify-end gap-2">
          {!required && (
            <button
              type="button"
              onClick={() => !uploading && onClose?.()}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!imageSrc || uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {required ? requiredSaveLabel : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
