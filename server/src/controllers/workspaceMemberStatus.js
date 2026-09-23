const { models } = require('../db');
const { Op } = require('sequelize');
const { getRequestContext } = require('../utils/auditContext');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');

// User reads are membership-scoped by the database hooks. Keep status in these
// admin responses workspace-local too, without mutating the shared User instance.
async function workspaceMemberStatuses(userIds) {
  const { organizationId } = getRequestContext();
  if (!organizationId) throw new ValidationError('An active workspace is required');
  const rows = userIds.length ? await models.OrganizationMembership.findAll({
    where: { organizationId, userId: { [Op.in]: userIds }, status: { [Op.in]: ['active', 'suspended'] } },
    attributes: ['userId', 'status'], raw: true,
  }) : [];
  const statuses = new Map(rows.map(row => [row.userId, row.status]));
  // A concurrent removal must not fall back to global status or expose the user.
  for (const id of userIds) {
    if (!statuses.has(id)) throw new NotFoundError('Workspace member not found');
  }
  return statuses;
}

module.exports = { workspaceMemberStatuses };
