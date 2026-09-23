module.exports = (sequelize, DataTypes) => {
  const SystemSettings = sequelize.define('SystemSettings', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    settingKey: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: false,
      field: 'setting_key'
    },
    settingValue: {
      type: DataTypes.TEXT,
      field: 'setting_value'
    },
    settingType: {
      type: DataTypes.STRING(50),
      defaultValue: 'string',
      field: 'setting_type'
    },
    category: {
      type: DataTypes.STRING(50)
    },
    description: {
      type: DataTypes.TEXT
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_public'
    },
    lastModifiedBy: {
      type: DataTypes.UUID,
      field: 'last_modified_by'
    }
  }, {
    tableName: 'system_settings',
    underscored: true,
    indexes: [
      { fields: ['setting_key'] },
      { fields: ['category'] },
      { unique: true, fields: ['organization_id', 'setting_key'] }
    ]
  });

  SystemSettings.associate = (models) => {
    SystemSettings.belongsTo(models.User, { foreignKey: 'last_modified_by', as: 'modifier', onDelete: 'SET NULL' });
    SystemSettings.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization' });
  };

  return SystemSettings;
};
