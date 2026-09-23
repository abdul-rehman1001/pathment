module.exports = (sequelize, DataTypes) => {
  /**
   * AIConnection - an admin-configured AI provider key (bring-your-own-key).
   * The raw key is stored encrypted (keyEncrypted) and never returned; the UI
   * only ever sees keyMasked (e.g. 'gsk_••••7f3a'). Feature→connection routing
   * lives in system_settings under 'ai.routing'.
   */
  const AIConnection = sequelize.define('AIConnection', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    provider: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: { isIn: [['groq', 'openai', 'anthropic', 'gemini', 'openrouter', 'custom']] }
    },
    label: { type: DataTypes.STRING(120), allowNull: false },
    model: { type: DataTypes.STRING(120), allowNull: true },
    baseUrl: { type: DataTypes.STRING(255), allowNull: true, field: 'base_url' },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'untested',
      validate: { isIn: [['connected', 'error', 'untested']] }
    },
    keyEncrypted: { type: DataTypes.TEXT, allowNull: false, field: 'key_encrypted' },
    keyMasked: { type: DataTypes.STRING(60), allowNull: true, field: 'key_masked' },
    // null = org-wide (admin-managed); set = this mentor's personal connection.
    ownerId: { type: DataTypes.UUID, allowNull: true, field: 'owner_id' },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' }
  }, {
    tableName: 'ai_connections',
    underscored: true,
    timestamps: true,
    // owner_id is filtered on every AI-feature resolution (resolveActiveConfig).
    indexes: [
      { fields: ['owner_id'] }
    ]
  });

  return AIConnection;
};
