module.exports = (sequelize, DataTypes) => {
  const OrganizationDomain = sequelize.define('OrganizationDomain', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    hostname: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    status: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending',
      validate: { isIn: [['pending', 'verified', 'disabled']] },
    },
    isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_primary' },
    verificationToken: { type: DataTypes.STRING(120), field: 'verification_token' },
    verifiedAt: { type: DataTypes.DATE, field: 'verified_at' },
  }, { tableName: 'organization_domains', underscored: true, indexes: [{ unique: true, fields: ['hostname'] }] });
  OrganizationDomain.associate = (models) => {
    OrganizationDomain.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization' });
  };
  return OrganizationDomain;
};
