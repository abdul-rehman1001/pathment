const { Op } = require('sequelize');

function requireWorkspaceId() {
  const id = require('./auditContext').getRequestContext().organizationId;
  if (!id) throw new Error('This operation requires an explicit workspace context');
  return id;
}

async function forEachWorkspace(operation) {
  const { models } = require('../db');
  const { runWithRequestContext } = require('./auditContext');
  const service = require('../services/organizationService');
  const where = { status: { [Op.in]: ['active', 'trial', 'past_due'] } };
  // Restricted staging fixtures must never start background delivery or AI work.
  if (!service.workspaceCreationEnabled()) where.slug = service.defaultSlug();
  const organizations = await models.Organization.findAll({ where, attributes: ['id', 'slug'], order: [['id', 'ASC']] });
  for (const organization of organizations) {
    try {
      await runWithRequestContext({ organizationId: organization.id, organizationSlug: organization.slug, workspaceJob: true },
        () => operation(organization));
    } catch (error) {
      // One tenant's bad integration or stale job cannot starve all other tenants.
      require('./logger').error('Workspace background pass failed', {
        organizationId: organization.id, message: error.message,
      });
    }
  }
}

async function isActiveWorkspaceUser(userId) {
  const { models } = require('../db');
  const membership = await models.OrganizationMembership.findOne({
    where: { organizationId: requireWorkspaceId(), userId, status: 'active' }, attributes: ['id'],
  });
  if (!membership) return false;
  return Boolean(await models.User.findOne({ where: { id: userId, status: 'active' }, attributes: ['id'] }));
}

module.exports = { requireWorkspaceId, forEachWorkspace, isActiveWorkspaceUser };
