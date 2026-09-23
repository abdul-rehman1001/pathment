const { sequelize, models } = require('../db');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors/errorTypes');

/** Operator-only service: deliberately has no HTTP route or workspace permission. */
async function activateRequestedPlan({ workspace, planKey, invoiceReference, operator, periodEnd }) {
  if (!invoiceReference?.trim() || !operator?.trim()) {
    throw new ValidationError('Invoice reference and operator identity are required');
  }
  const endsAt = new Date(periodEnd);
  if (!Number.isFinite(endsAt.getTime()) || endsAt <= new Date()) {
    throw new ValidationError('A future invoice coverage end date is required');
  }
  return sequelize.transaction(async transaction => {
    const organization = await models.Organization.findOne({ where: { slug: workspace }, transaction });
    if (!organization) throw new NotFoundError('Workspace not found');
    const subscription = await models.OrganizationSubscription.findOne({
      where: { organizationId: organization.id }, transaction,
      lock: transaction.LOCK.UPDATE, skipOrganizationScope: true,
    });
    const plan = await models.Plan.findOne({ where: { key: planKey, active: true }, transaction });
    if (!subscription || !plan) throw new NotFoundError('Subscription or plan not found');
    const previous = await models.AuditLog.findOne({
      where: { organizationId: organization.id, action: 'MANUAL_PLAN_ACTIVATED',
        newValues: { invoiceReference: invoiceReference.trim() } },
      transaction, skipOrganizationScope: true,
    });
    if (previous) {
      if (previous.newValues.planId !== plan.id || previous.newValues.periodEnd !== endsAt.toISOString()) {
        throw new ConflictError('This invoice reference was already used for a different activation');
      }
      return { workspace, plan: plan.key, alreadyActivated: true };
    }
    if (subscription.requestedPlanId !== plan.id) {
      throw new ConflictError('The pending plan has changed. Review the workspace request before activation');
    }
    const oldValues = { planId: subscription.planId, status: subscription.status };
    await subscription.update({
      planId: plan.id, status: 'active', provider: 'manual_invoice',
      requestedPlanId: null, requestedAt: null,
      currentPeriodStart: new Date(), currentPeriodEnd: endsAt,
      cancelAtPeriodEnd: false,
    }, { transaction, skipOrganizationScope: true });
    // Unlike best-effort product logs, this evidence must commit with billing.
    await models.AuditLog.create({
      organizationId: organization.id, userId: null,
      action: 'MANUAL_PLAN_ACTIVATED', entityType: 'OrganizationSubscription', entityId: subscription.id,
      oldValues, newValues: { planId: plan.id, invoiceReference: invoiceReference.trim(),
        operator: operator.trim(), periodEnd: endsAt.toISOString() },
    }, { transaction, skipOrganizationScope: true });
    return { workspace, plan: plan.key, alreadyActivated: false };
  });
}

module.exports = { activateRequestedPlan };
