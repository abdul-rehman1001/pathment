import type { CertificateVerification, ReviewerClanState } from '../services/certificates-api';

/** Historical review rounds can include mentees no longer in the active roster. */
export function scopeCertificateReviews(
  roster: ReadonlyArray<{ id: string }>,
  reviews: ReadonlyArray<CertificateVerification>,
  clans: ReadonlyArray<ReviewerClanState>,
) {
  const activeIds = new Set(roster.map(mentee => mentee.id));
  const rows = reviews.filter(row => activeIds.has(row.menteeId));
  const counts = new Map<string, { pending: number; verified: number }>();
  for (const row of rows) {
    if (!row.clanId) continue;
    const count = counts.get(row.clanId) ?? { pending: 0, verified: 0 };
    if (row.status === 'verified') count.verified++;
    else count.pending++;
    counts.set(row.clanId, count);
  }
  return {
    rows,
    // Approval is an authoritative server decision, never inferred from counts.
    clans: clans.filter(clan => counts.has(clan.clanId)).map(clan => ({
      ...clan,
      ...counts.get(clan.clanId)!,
    })),
  };
}
