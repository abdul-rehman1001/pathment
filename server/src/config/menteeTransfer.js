/**
 * Mentee transfer (mentor-to-mentor clan move) — feature gate.
 *
 * The feature ships DORMANT and unlocks itself on a date, with no deploy and no
 * one having to flip anything: before `releaseAt` mentors see a "Coming soon"
 * teaser and every write is refused server-side; from `releaseAt` it is simply
 * live. For a week after release it is flagged `isNew` so the UI can badge it
 * and mentors notice a capability they didn't have yesterday.
 *
 * Overrides (both optional):
 *   MENTEE_TRANSFER_RELEASE_AT  ISO date — move the unlock earlier/later
 *                               (staging typically sets a past date to test now).
 *   MENTEE_TRANSFER_ENABLED     'true' forces it ON, 'false' forces it OFF,
 *                               regardless of the date. A kill switch.
 */

const DEFAULT_RELEASE_AT = '2026-08-07T00:00:00.000Z';
/** How long after release the UI keeps calling it new. */
const NEW_FOR_DAYS = 7;

function releaseAt() {
  const raw = process.env.MENTEE_TRANSFER_RELEASE_AT;
  const parsed = raw ? new Date(raw) : new Date(DEFAULT_RELEASE_AT);
  return Number.isNaN(parsed.getTime()) ? new Date(DEFAULT_RELEASE_AT) : parsed;
}

function override() {
  const raw = String(process.env.MENTEE_TRANSFER_ENABLED || '').trim().toLowerCase();
  if (['1', 'true', 'yes'].includes(raw)) return true;
  if (['0', 'false', 'no'].includes(raw)) return false;
  return null; // no override — the date decides
}

/** Is the feature usable right now? */
function enabled(now = new Date()) {
  const forced = override();
  if (forced !== null) return forced;
  return now.getTime() >= releaseAt().getTime();
}

/** Released within the last NEW_FOR_DAYS → worth badging in the UI. */
function isNew(now = new Date()) {
  if (!enabled(now)) return false;
  const since = now.getTime() - releaseAt().getTime();
  // A forced-on override with a future release date still counts as new.
  if (since < 0) return true;
  return since <= NEW_FOR_DAYS * 24 * 60 * 60 * 1000;
}

/** What the client needs to render the gate: live, teaser, or badged. */
function publicConfig(now = new Date()) {
  const on = enabled(now);
  return {
    enabled: on,
    // Never a bare hidden feature: when it's off we always tease it.
    comingSoon: !on,
    releaseAt: releaseAt().toISOString(),
    isNew: isNew(now),
  };
}

module.exports = { enabled, isNew, releaseAt, publicConfig, NEW_FOR_DAYS };
