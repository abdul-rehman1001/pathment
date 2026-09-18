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

/**
 * Clan roles, strongest first.
 *
 * One person can hold several in one clan — the promotion path deliberately
 * keeps somebody's mentee row when they become a co-mentor — so "what is this
 * person here?" needs a tie-break, and it is always the most senior hat.
 */
const CLAN_ROLE_RANK = { lead_mentor: 3, core_team: 2, co_mentor: 1, mentee: 0 };

/** The most senior of the clan roles given, or null when there are none. */
const strongestClanRole = (roles) =>
  [...(roles || [])].sort((a, b) => (CLAN_ROLE_RANK[b] ?? -1) - (CLAN_ROLE_RANK[a] ?? -1))[0] || null;

module.exports = { VISIBLE_MEMBERSHIP_STATUSES, CLAN_ROLE_RANK, strongestClanRole };
