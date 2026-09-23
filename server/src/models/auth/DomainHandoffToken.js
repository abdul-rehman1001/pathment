module.exports = (sequelize, DataTypes) => {
  const DomainHandoffToken = sequelize.define('DomainHandoffToken', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true, field: 'token_hash' },
    codeChallenge: { type: DataTypes.STRING(43), field: 'code_challenge' },
    userId: { type: DataTypes.UUID, allowNull: false, field: 'user_id' },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    rememberSession: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'remember_session' },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
    usedAt: { type: DataTypes.DATE, field: 'used_at' },
  }, {
    tableName: 'domain_handoff_tokens',
    underscored: true,
    updatedAt: false,
    indexes: [
      { fields: ['user_id', 'organization_id', 'created_at'] },
      { fields: ['expires_at'] },
    ],
  });

  DomainHandoffToken.associate = (models) => {
    DomainHandoffToken.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    DomainHandoffToken.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization' });
  };
  return DomainHandoffToken;
};
