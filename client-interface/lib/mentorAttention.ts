import type { CohortMentee } from '@/lib/hooks/mentor';

export function needsMentorAttention(m: CohortMentee): boolean {
  return m.risk !== 'low' || m.openBlockers > 0 || m.pendingApprovals > 0 || m.momentum === 'down';
}

export function mentorAttentionReason(m: CohortMentee): string {
  const reasons = [
    m.openBlockers > 0 ? `${m.openBlockers} roadblock${m.openBlockers === 1 ? '' : 's'}` : '',
    m.pendingApprovals > 0 ? `${m.pendingApprovals} awaiting review` : '',
    m.risk === 'high' ? 'Needs a check-in' : m.risk === 'watch' ? 'Progress slipping' : '',
    m.momentum === 'down' ? 'Momentum slowing' : '',
  ];
  return reasons.filter(Boolean).join(' · ') || 'On track';
}
