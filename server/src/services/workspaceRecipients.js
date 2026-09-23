const { Op } = require('sequelize');

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

module.exports = { admins };
