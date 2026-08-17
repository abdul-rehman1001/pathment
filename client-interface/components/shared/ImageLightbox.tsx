'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { SubmissionFile } from '@/lib/types/submission';

interface ImageLightboxProps {
  file: SubmissionFile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Move to the previous image in the submission. */
  onPrev?: () => void;
  /** Move to the next image in the submission. */
  onNext?: () => void;
  /** Hide/disable the previous arrow (first image). */
  canPrev?: boolean;
  /** Hide/disable the next arrow (last image). */
  canNext?: boolean;
  /** Position indicator, e.g. "2 / 5". */
  positionLabel?: string;
}

/**
 * Full-size viewer for a submission image. Fully controlled: the parent owns
 * the open state and current image. Arrows navigate through the submission's
 * images; the parent supplies the callbacks.
 */
export function ImageLightbox({
  file,
  open,
  onOpenChange,
  onPrev,
  onNext,
  canPrev = true,
  canNext = true,
  positionLabel,
}: ImageLightboxProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl bg-slate-950 border-slate-800 p-0 overflow-hidden">
        <DialogTitle className="sr-only">Image preview</DialogTitle>
        <DialogDescription className="sr-only">
          Preview of {file.fileName}
        </DialogDescription>

        <div className="relative flex items-center justify-center bg-black/60 min-h-[50vh] max-h-[80vh] p-4">
          {onPrev && (
            <button
              type="button"
              onClick={onPrev}
              disabled={!canPrev}
              aria-label="Previous image"
              className="absolute left-3 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-0 disabled:pointer-events-none transition-opacity"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={file.fileUrl}
            alt={file.fileName}
            className="max-w-full max-h-[78vh] rounded-lg object-contain"
          />

          {onNext && (
            <button
              type="button"
              onClick={onNext}
              disabled={!canNext}
              aria-label="Next image"
              className="absolute right-3 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-0 disabled:pointer-events-none transition-opacity"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-t border-slate-800">
          <p className="text-sm text-slate-200 truncate">{file.fileName}</p>
          {positionLabel && <span className="text-xs text-slate-400 shrink-0">{positionLabel}</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}