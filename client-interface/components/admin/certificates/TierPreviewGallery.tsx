'use client';

import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { CertificatePreview } from '@/components/certificates/shared';
import type { CertificateRenderData, RenderableTemplate } from '@/lib/utils/certificate-renderer';
import type { TierCriteria } from './certificate-constants';

/**
 * Stand-in values for a certificate nobody has earned yet.
 *
 * Shared with the editor canvas so the two agree: a preview that filled the
 * placeholders differently from the thing you were dragging would be worse than
 * no preview. The name is deliberately long-ish and the number is a real
 * twelve-character shape, because a layout that only works for "Bob" and a
 * four-digit number is a layout that breaks on the first real recipient.
 */
export const PREVIEW_PLACEHOLDERS = {
  menteeName: 'Muhammad Abdulrehman',
  issuerName: 'Dev Weekends',
  issuerTitle: 'Programme Director',
  certificateNumber: 'ABCD1234EFGH',
} as const;

/** The dummy data a tier's certificate is previewed with. */
export function buildPreviewData(tier: TierCriteria, programName: string): CertificateRenderData {
  return {
    menteeName: PREVIEW_PLACEHOLDERS.menteeName,
    programName,
    fellowshipName: programName,
    dateIssued: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    issuerName: PREVIEW_PLACEHOLDERS.issuerName,
    issuerTitle: PREVIEW_PLACEHOLDERS.issuerTitle,
    certificateNumber: PREVIEW_PLACEHOLDERS.certificateNumber,
    tier: tier.id,
    tierName: tier.name,
  };
}

interface TierPreviewGalleryProps {
  open: boolean;
  onClose: () => void;
  template: RenderableTemplate;
  criteria: TierCriteria[];
  programName: string;
  /** Jump to designing one type — the point of spotting a problem is fixing it. */
  onEditTier?: (tierId: string) => void;
}

/**
 * Every certificate type, side by side, exactly as it will be issued.
 *
 * The editor canvas shows one type at a time and carries selection outlines and
 * drag handles, so it answers "where is this layer" but not "does the set look
 * right together". This renders each type through the SAME component the mentee
 * downloads from, with placeholder details, so a name sitting too low on Silver
 * is obvious next to Gold where it sits correctly.
 */
export function TierPreviewGallery({
  open, onClose, template, criteria, programName, onEditTier,
}: TierPreviewGalleryProps) {
  // Escape closes, and the page behind does not scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8">
      <button
        type="button"
        aria-label="Close preview"
        onClick={onClose}
        className="fixed inset-0 cursor-default"
        tabIndex={-1}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Certificate previews"
        className="relative w-full max-w-5xl rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-sm font-bold text-foreground">Preview every certificate type</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Placeholder details, real layout — this is what each type produces when it is issued.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-6 p-6 md:grid-cols-2">
          {criteria.map((tier) => (
            <TierPreviewCard
              key={tier.id}
              tier={tier}
              template={template}
              programName={programName}
              onEdit={onEditTier ? () => { onEditTier(tier.id); onClose(); } : undefined}
            />
          ))}
        </div>

        {criteria.length === 0 && (
          <p className="px-6 pb-6 text-xs text-muted-foreground">
            Add a certificate type below to preview it.
          </p>
        )}
      </div>
    </div>
  );
}

function TierPreviewCard({
  tier, template, programName, onEdit,
}: {
  tier: TierCriteria;
  template: RenderableTemplate;
  programName: string;
  onEdit?: () => void;
}) {
  const hasArtwork = Boolean(tier.artworkUrl);
  const placementCount = Array.isArray(tier.layout) ? tier.layout.length : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-foreground">{tier.name}</span>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-[10px] font-bold text-brand-600 hover:underline"
          >
            Edit this type
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
        <CertificatePreview
          template={template}
          recipientData={buildPreviewData(tier, programName)}
        />
      </div>

      {/* A type that cannot produce a certificate should say so here, where the
          admin is already looking at it, rather than at download time. */}
      {(!hasArtwork || placementCount === 0) && (
        <p className="flex items-start gap-1.5 text-[10px] font-semibold text-amber-600">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          {!hasArtwork
            ? 'No artwork uploaded — this type will render blank.'
            : 'No name, date or number placed on this type yet.'}
        </p>
      )}
    </div>
  );
}
