export type CertificateDecision = 'award' | 'no_certificate' | 'undecided';

// A select-control value only. Never store this string as a certificate tier.
export const NO_CERTIFICATE = '__no_certificate__';
export const AWARDED_CERTIFICATES = '__awarded__';
export function reviewSelection(review?: { decision?: CertificateDecision; finalTier?: string | null; aiTier?: string | null } | null) {
  return review?.decision === 'no_certificate' ? NO_CERTIFICATE : review?.finalTier ?? review?.aiTier ?? '';
}
export function aiSelection(result?: { decision?: CertificateDecision; certificate_tier?: string | null } | null) {
  return result?.decision === 'no_certificate' ? NO_CERTIFICATE : result?.certificate_tier ?? '';
}
export function decisionPayload(selection: string) {
  return selection === NO_CERTIFICATE
    ? { decision: 'no_certificate' as const, finalTier: null }
    : { decision: 'award' as const, finalTier: selection };
}
