const { Op } = require('sequelize');
const { DEFAULT_PLANS } = require('./migrations/110_multi_tenant_foundation');

// Demo reset deletes global demo identities, so it is only supported in a
// dedicated demo database, never alongside real people or other workspaces.
async function prepareDemoWorkspace({ sequelize, models }) {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seeding is disabled in production');
  for (const slug of [process.env.DEFAULT_ORGANIZATION_SLUG, process.env.TENANT_SLUG]) {
    if (slug && slug !== 'devweekends') throw new Error('Demo seeding requires the DevWeekends workspace');
  }
  const realUsers = await models.User.count({
    where: { email: { [Op.notLike]: '%@demo.pathment.com' } }, paranoid: false,
    skipOrganizationScope: true,
  });
  const otherOrganizations = await models.Organization.count({
    where: { slug: { [Op.ne]: 'devweekends' } }, paranoid: false,
  });
  if (realUsers || otherOrganizations) {
    throw new Error('Use a dedicated demo database: real accounts or other workspaces exist. No demo data was cleared.');
  }
  return sequelize.transaction(async transaction => {
    const [organization] = await models.Organization.findOrCreate({
      where: { slug: 'devweekends' }, paranoid: false,
      defaults: { name: 'Dev Weekends', status: 'active', timezone: 'Asia/Karachi' }, transaction,
    });
    if (organization.deletedAt || organization.status !== 'active') {
      throw new Error('The demo workspace is archived or inactive; it will not be reactivated automatically');
    }
    for (const plan of DEFAULT_PLANS) {
      await models.Plan.findOrCreate({ where: { key: plan.key }, defaults: {
        name: plan.name, description: plan.description, monthlyPriceCents: plan.monthly,
        annualPriceCents: plan.annual, limits: plan.limits, features: plan.features,
        sortOrder: plan.sort, currency: 'USD', active: true,
      }, transaction });
    }
    const plan = await models.Plan.findOne({ where: { key: 'growth' }, transaction });
    await models.OrganizationSubscription.findOrCreate({
      where: { organizationId: organization.id },
      defaults: { planId: plan.id, status: 'active', provider: 'demo', currentPeriodStart: new Date() },
      transaction,
    });
    return organization;
  });
}

module.exports = { prepareDemoWorkspace };
