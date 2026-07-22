/**
 * Cohort-review live-meeting config — one place to tune the video provider and
 * the contribution rule. Provider-flexible: point JITSI_DOMAIN at a self-hosted
 * Jitsi or JaaS later without touching the code.
 */
module.exports = {
  // 'jitsi' today; the room URL is built from the domain below.
  provider: process.env.REVIEW_MEETING_PROVIDER || 'jitsi',
  // The public free service by default; override to self-host / JaaS.
  jitsiDomain: process.env.JITSI_DOMAIN || 'meet.jit.si',
  // A mentee who was the dominant speaker for at least this long earns the
  // (single) contribution point — a proxy the mentor can override.
  contributionThresholdSeconds: Number(process.env.REVIEW_CONTRIBUTION_SECONDS) || 60,
  // Points granted for contributing in a review.
  contributionPoints: Number(process.env.REVIEW_CONTRIBUTION_POINTS) || 1,
};
