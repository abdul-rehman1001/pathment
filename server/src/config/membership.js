/**
 * Clan membership status semantics.
 *
 * `clan_memberships.status` is one of 'active' | 'invited' | 'removed' | 'paused'.
 * The distinction that matters everywhere else is: which of those still mean
 * "this person belongs to the clan"?
 *
 * A PAUSED mentee does. They stopped attending, so they are excluded from
 * reports, reminders and the working cohort — but they are still in the clan,
 * still their mentor's responsibility, and the whole point of the pause feature
 * is that someone brings them back. Filtering them out at the access layer is
 * what made a mentor's own mentee 403 with "Mentee not found", and what stopped
 * a paused mentee messaging the mentor the pause email told them to message.
 *
 * 'invited' (never joined) and 'removed' (gone) do not belong.
 */
const VISIBLE_MEMBERSHIP_STATUSES = ['active', 'paused'];

module.exports = { VISIBLE_MEMBERSHIP_STATUSES };
