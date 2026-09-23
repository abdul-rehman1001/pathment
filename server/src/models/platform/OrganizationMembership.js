module.exports = (sequelize, DataTypes) => {
  const OrganizationMembership = sequelize.define('OrganizationMembership', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    role: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'member',
      validate: { isIn: [['owner', 'admin', 'member', 'guest']] },
    },
    status: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active',
      validate: { isIn: [['invited', 'active', 'suspended', 'left']] },
    },
    joinedAt: { type: DataTypes.DATE, field: 'joined_at' },
    invitedBy: { type: DataTypes.UUID, field: 'invited_by' },
  }, {
    tableName: 'organization_memberships', underscored: true,
    indexes: [
      { unique: true, fields: ['organization_id', 'user_id'] },
      { fields: ['user_id', 'status'] },
    ],
  });
  OrganizationMembership.associate = (models) => {
    OrganizationMembership.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization' });
    OrganizationMembership.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    OrganizationMembership.belongsTo(models.User, { foreignKey: 'invited_by', as: 'inviter' });
  };
  return OrganizationMembership;
};
