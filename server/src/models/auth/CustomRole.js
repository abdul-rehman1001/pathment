module.exports = (sequelize, DataTypes) => {
  /**
   * CustomRole - an admin-defined permission bundle, layered on top of the
   * built-in roles (src/config/roles.js). Referenced by `key` from
   * role_assignments exactly like a built-in role. authzService merges these in.
   */
  const CustomRole = sequelize.define('CustomRole', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    key: {
      type: DataTypes.STRING(60),
      allowNull: false,
      unique: false
    },
    label: {
      type: DataTypes.STRING(80),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    scopeLevel: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'org',
      field: 'scope_level',
      validate: { isIn: [['org', 'program', 'clan', 'self']] }
    },
    permissions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by'
    }
  }, {
    tableName: 'custom_roles',
    underscored: true,
    indexes: [{ unique: true, fields: ['organization_id', 'key'] }]
  });

  CustomRole.associate = (models) => {
    CustomRole.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization' });
  };

  return CustomRole;
};
