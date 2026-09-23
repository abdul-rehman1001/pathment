module.exports = (sequelize, DataTypes) => {
  const Plan = sequelize.define('Plan', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    key: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.TEXT },
    monthlyPriceCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'monthly_price_cents' },
    annualPriceCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'annual_price_cents' },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'USD' },
    limits: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    features: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'sort_order' },
  }, { tableName: 'plans', underscored: true, indexes: [{ unique: true, fields: ['key'] }] });
  Plan.associate = (models) => {
    Plan.hasMany(models.OrganizationSubscription, { foreignKey: 'plan_id', as: 'subscriptions' });
  };
  return Plan;
};
