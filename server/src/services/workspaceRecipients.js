const { Op } = require('sequelize');

// Roles that administer, mirroring authzService's ADMIN_TIER_ROLES. Kept as a
// literal rather than imported because requiring authzService here would close
// a cycle: authzService -> clanService -> notification paths -> here.
const ADMIN_TIER_ROLES = ['super_admin', 'program_admin', 'intake_manager', 'people_admin', 'moderator', 'analyst'];

/** Administrative notifications follow workspace authority, never account roles. */
async function admins() {
  const { models } = require('../db');
  const organizationId = require('../utils/workspaceExecution').requireWorkspaceId();
  const memberships = await models.OrganizationMembership.findAll({
    where: { organizationId, status: 'active' },
    attributes: ['userId', 'role'],
  });
  if (!memberships.length) return [];
  const explicit = await models.RoleAssignment.findAll({
    where: { organizationId, userId: { [Op.in]: memberships.map(row => row.userId) }, role: 'super_admin', scopeType: 'org' },
    attributes: ['userId'],
  });
  const ids = [...new Set([
    ...memberships.filter(row => ['owner', 'admin'].includes(row.role)).map(row => row.userId),
    ...explicit.map(row => row.userId),
  ])];
  return models.User.findAll({
    where: { id: { [Op.in]: ids }, status: 'active' },
    attributes: ['id'],
  });
}

/**
 * Everyone who can decide something about ONE programme: the org-tier admins
 * above, plus the admins scoped to just that programme.
 *
 * `admins()` deliberately returns org-tier authority only, and for most
 * notifications that is right. It is wrong for anything a programme admin is
 * expected to act on: the person who runs the fellowship a mentee is actually
 * in is the one who should see their request, and they are the one `admins()`
 * leaves out. Sending to `admins()` alone means the request sits unseen by
 * the only person watching that programme.
 *
 * The converse matters just as much. Returning every admin in the workspace
 * would put one programme's mentee, their reason for wanting to leave and the
 * clan they named in front of admins who have no business in that programme -
 * the same scope leak this codebase has had to close six times. A programme
 * admin hears about their own programme and nothing else.
 *
 * @param {string|null} programId  Null/unknown → org-tier admins only, since
 *   there is no programme to widen to.
 */
async function programAdmins(programId) {
  const { models } = require('../db');
  const orgTier = await admins();
  if (!programId) return orgTier;

  const organizationId = require('../utils/workspaceExecution').requireWorkspaceId();
  const scoped = await models.RoleAssignment.findAll({
    where: {
      organizationId,
      scopeType: 'program',
      scopeId: programId,
      role: { [Op.in]: ADMIN_TIER_ROLES },
    },
    attributes: ['userId'],
  });
  const extra = scoped
    .map((row) => row.userId)
    .filter((id) => id && !orgTier.some((u) => u.id === id));
  if (!extra.length) return orgTier;

  // Still a member of this workspace, and still active - a role assignment
  // outlives the membership that justified it.
  const active = await models.OrganizationMembership.findAll({
    where: { organizationId, userId: { [Op.in]: extra }, status: 'active' },
    attributes: ['userId'],
  });
  if (!active.length) return orgTier;

  const users = await models.User.findAll({
    where: { id: { [Op.in]: active.map((row) => row.userId) }, status: 'active' },
    attributes: ['id'],
  });
  return [...orgTier, ...users];
}

module.exports = { admins, programAdmins };
