module.exports = (sequelize, DataTypes) => {
  const Organization = sequelize.define('Organization', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(160), allowNull: false },
    slug: {
      type: DataTypes.STRING(63), allowNull: false, unique: true,
      validate: { is: /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/ },
    },
    status: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active',
      validate: { isIn: [['trial', 'active', 'past_due', 'suspended', 'archived']] },
    },
    logoUrl: { type: DataTypes.TEXT, field: 'logo_url' },
    primaryColor: { type: DataTypes.STRING(20), field: 'primary_color', defaultValue: '#4f46e5' },
    timezone: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'UTC' },
    settings: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    createdBy: { type: DataTypes.UUID, field: 'created_by' },
  }, {
    tableName: 'organizations', underscored: true, paranoid: true,
    indexes: [{ unique: true, fields: ['slug'] }, { fields: ['status'] }],
  });

  Organization.associate = (models) => {
    Organization.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    Organization.hasMany(models.OrganizationMembership, { foreignKey: 'organization_id', as: 'memberships' });
    Organization.hasMany(models.Program, { foreignKey: 'organization_id', as: 'programs' });
    Organization.hasMany(models.OrganizationDomain, { foreignKey: 'organization_id', as: 'domains' });
    Organization.hasOne(models.OrganizationSubscription, { foreignKey: 'organization_id', as: 'subscription' });
  };
  return Organization;
};
