'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Award, ChevronDown, Layers, Loader2, Trash2, Upload, X } from 'lucide-react';
import { certificatesApi, type CertificateElement } from '@/lib/services/certificates-api';
import { FileDragDrop } from '@/components/shared/FileDragDrop';
import type { TierCriteria } from './certificate-constants';

interface TierVariantPanelProps {
  element: CertificateElement;
  criteria: TierCriteria[];
  onChange: (key: keyof CertificateElement, value: unknown) => void;
}

const isBlank = (value?: string) => !value || !value.trim();

/**
 * Per-tier authoring for one layer.
 *
 * A certificate is designed once and issued at whichever tier the recipient
 * earned. Usually only a little needs to change between a gold and a
 * participation award — a line of wording, the badge, a seal the top tier alone
 * gets — so the variation belongs to the LAYER, not to a second copy of the
 * whole template that will drift the first time somebody nudges the signature.
 *
 * Two controls, deliberately separate:
 *
 *   Shown for    which tiers get this layer at all  (`visibleForTiers`)
 *   Per tier     what it says or shows on each one  (`tierValues`)
 *
 * Either is useful without the other: a gold-only seal needs only the first, a
 * title that reads differently per tier needs only the second.
 *
 * Both are "unset means every tier" — leaving this panel untouched keeps the
 * layer behaving exactly as it did before per-tier content existed.
 */
export function TierVariantPanel({ element, criteria, onChange }: TierVariantPanelProps) {
  const isBadge = element.type === 'badge';
  const tierValues = element.tierValues || {};
  const visibleFor = element.visibleForTiers || [];
  const [uploadingTierId, setUploadingTierId] = useState<string | null>(null);

  // Variants stay collapsed until asked for: most layers are the same on every
  // certificate, and a row per tier on each one would bury the font controls.
  const hasVariants = Object.values(tierValues).some(v => !isBlank(v));
  const [expanded, setExpanded] = useState(hasVariants);

  if (criteria.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-3 py-2.5 text-[10px] text-muted-foreground">
        Add at least one certificate type below to give this layer per-tier content.
      </div>
    );
  }

  const setTierValue = (tierId: string, value: string) => {
    const next = { ...tierValues, [tierId]: value };
    // Drop blanks rather than storing empty strings: "" and "absent" would
    // otherwise mean the same thing to the renderer but differ in the payload.
    if (isBlank(value)) delete next[tierId];
    onChange('tierValues', Object.keys(next).length ? next : undefined);
  };

  const toggleVisibleTier = (tierId: string) => {
    // An empty list MEANS every tier, and the chips show it that way — so the
    // toggle has to start from what is on screen, not from the empty list.
    // Reading the stored value literally would turn the first click on an
    // apparently-selected chip into "only this tier", the exact opposite of
    // what deselecting it should do.
    const current = visibleFor.length === 0 ? criteria.map(t => t.id) : visibleFor;
    const next = current.includes(tierId)
      ? current.filter(id => id !== tierId)
      : [...current, tierId];
    // Every tier selected says the same thing as none selected ("show it
    // everywhere"), and the empty form is the one the renderer treats as the
    // default — so collapse to it rather than storing the full list.
    onChange('visibleForTiers', next.length === 0 || next.length === criteria.length ? undefined : next);
  };

  const uploadTierBadge = async (tierId: string, files: File[]) => {
    if (!files.length) return;
    try {
      setUploadingTierId(tierId);
      const res = await certificatesApi.uploadAsset(files[0]);
      if (res.success && res.url) {
        setTierValue(tierId, res.url);
        toast.success('Badge uploaded for this tier');
      } else {
        toast.error('Upload did not return an image URL');
      }
    } catch {
      toast.error('Could not upload that badge image');
    } finally {
      setUploadingTierId(null);
    }
  };

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      {/* ── Which tiers get this layer at all ─────────────────────────────── */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1.5">
          <Layers className="w-3 h-3 text-brand-500" /> Shown for
        </label>
        <div className="flex flex-wrap gap-1.5">
          {criteria.map(tier => {
            const active = visibleFor.length === 0 || visibleFor.includes(tier.id);
            return (
              <button
                key={tier.id}
                type="button"
                onClick={() => toggleVisibleTier(tier.id)}
                className={`px-2 py-1 rounded-lg border text-[10px] font-bold transition-colors ${
                  active
                    ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-400'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                {tier.name}
              </button>
            );
          })}
        </div>
        <p className="text-[9px] text-muted-foreground leading-relaxed">
          {visibleFor.length === 0
            ? 'On every certificate. Deselect a type to leave this layer off it.'
            : `Only on ${visibleFor.length} of ${criteria.length} certificate types.`}
        </p>
      </div>

      {/* ── Per-tier content ──────────────────────────────────────────────── */}
      {/* This used to be a muted uppercase label with a tiny "Set up" on the
          right — it read as a section heading rather than something you could
          open, sat below every font control, and was collapsed by default. The
          feature was unfindable. It is a real button now, and it says what it
          does while still closed. */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
            expanded || hasVariants
              ? 'border-brand-500/40 bg-brand-500/5'
              : 'border-border bg-background hover:border-brand-500/40 hover:bg-brand-500/5'
          }`}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
              <Award className="w-3.5 h-3.5 text-brand-500" />
              {isBadge ? 'Different badge per type' : 'Different wording per type'}
            </span>
            <span className="flex items-center gap-1 text-[9px] font-bold text-brand-600 dark:text-brand-400 shrink-0">
              {hasVariants ? `${Object.keys(tierValues).length} set` : expanded ? 'Close' : 'Set up'}
              <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </span>
          </span>
          {!expanded && (
            <span className="mt-1 block text-[9px] font-normal leading-relaxed text-muted-foreground">
              {isBadge
                ? 'Show a different badge on Gold, Silver, Bronze…'
                : 'Say something different on Gold, Silver, Bronze…'}
            </span>
          )}
        </button>

        {expanded && (
          <div className="space-y-2">
            <p className="text-[9px] text-muted-foreground leading-relaxed">
              {isBadge
                ? 'Leave a type empty to fall back to the badge set on that certificate type itself.'
                : 'Leave a type empty to use the layer’s own text. Variables like {{mentee_name}} still work here.'}
            </p>

            {criteria.map(tier => {
              const value = tierValues[tier.id] || '';
              const busy = uploadingTierId === tier.id;

              return (
                <div key={tier.id} className="rounded-xl border border-border bg-background p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-foreground truncate">{tier.name}</span>
                    {!isBlank(value) && (
                      <button
                        type="button"
                        onClick={() => setTierValue(tier.id, '')}
                        title="Clear this type"
                        aria-label={`Clear ${tier.name}`}
                        className="p-1 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-500/10 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {isBadge ? (
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 shrink-0 rounded-lg border border-border bg-muted/40 grid place-items-center overflow-hidden">
                        {value ? (
                          <img src={value} alt={`${tier.name} badge`} className="w-full h-full object-contain" />
                        ) : tier.badgeUrl ? (
                          <img src={tier.badgeUrl} alt={`${tier.name} default badge`} className="w-full h-full object-contain opacity-40" />
                        ) : (
                          <Award className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <FileDragDrop onFilesSelected={files => uploadTierBadge(tier.id, files)} accept="image/*" multiple={false}>
                        {({ openFilePicker }) => (
                          <button
                            type="button"
                            onClick={openFilePicker}
                            disabled={busy}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg border border-border bg-muted hover:bg-muted/70 text-[10px] font-bold text-foreground disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                            {value ? 'Replace' : 'Upload'}
                          </button>
                        )}
                      </FileDragDrop>
                    </div>
                  ) : (
                    <textarea
                      rows={2}
                      value={value}
                      placeholder={element.text || 'Same as the layer’s text'}
                      onChange={e => setTierValue(tier.id, e.target.value)}
                      className="w-full px-2.5 py-1.5 text-[11px] font-semibold bg-card border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The tier the canvas is previewing, so an admin can see what each certificate
 * type actually produces while they lay it out. Without it, per-tier content is
 * authored blind — the canvas would only ever show one of the variants.
 */
export function TierPreviewSwitcher({
  criteria,
  value,
  onChange,
}: {
  criteria: TierCriteria[];
  value: string | null;
  onChange: (tierId: string | null) => void;
}) {
  if (criteria.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mr-0.5">Previewing</span>
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`px-2 py-1 rounded-lg border text-[10px] font-bold transition-colors flex items-center gap-1 ${
          value === null
            ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-400'
            : 'border-border bg-background text-muted-foreground hover:text-foreground'
        }`}
      >
        {value === null && <X className="w-2.5 h-2.5" />}
        All layers
      </button>
      {criteria.map(tier => (
        <button
          key={tier.id}
          type="button"
          onClick={() => onChange(tier.id)}
          className={`px-2 py-1 rounded-lg border text-[10px] font-bold transition-colors ${
            value === tier.id
              ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-400'
              : 'border-border bg-background text-muted-foreground hover:text-foreground'
          }`}
        >
          {tier.name}
        </button>
      ))}
    </div>
  );
}
