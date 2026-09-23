module.exports = (sequelize, DataTypes) => {
  const OrganizationSubscription = sequelize.define('OrganizationSubscription', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'organization_id' },
    planId: { type: DataTypes.UUID, allowNull: false, field: 'plan_id' },
    status: {
      type: DataTypes.STRING(24), allowNull: false, defaultValue: 'trialing',
      validate: { isIn: [['trialing', 'active', 'past_due', 'paused', 'cancelled']] },
    },
    billingInterval: {
      type: DataTypes.STRING(12), allowNull: false, defaultValue: 'monthly', field: 'billing_interval',
      validate: { isIn: [['monthly', 'annual']] },
    },
    provider: { type: DataTypes.STRING(30) },
    providerCustomerId: { type: DataTypes.STRING(255), field: 'provider_customer_id' },
    providerSubscriptionId: { type: DataTypes.STRING(255), field: 'provider_subscription_id' },
    requestedPlanId: { type: DataTypes.UUID, field: 'requested_plan_id' },
    requestedAt: { type: DataTypes.DATE, field: 'requested_at' },
    trialEndsAt: { type: DataTypes.DATE, field: 'trial_ends_at' },
    currentPeriodStart: { type: DataTypes.DATE, field: 'current_period_start' },
    currentPeriodEnd: { type: DataTypes.DATE, field: 'current_period_end' },
    cancelAtPeriodEnd: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'cancel_at_period_end' },
    overrides: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  }, { tableName: 'organization_subscriptions', underscored: true });
  OrganizationSubscription.associate = (models) => {
    OrganizationSubscription.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization' });
    OrganizationSubscription.belongsTo(models.Plan, { foreignKey: 'plan_id', as: 'plan' });
    OrganizationSubscription.belongsTo(models.Plan, { foreignKey: 'requested_plan_id', as: 'requestedPlan' });
  };
  return OrganizationSubscription;
};
