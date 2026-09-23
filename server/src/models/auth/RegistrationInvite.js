module.exports = (sequelize, DataTypes) => {
  const RegistrationInvite = sequelize.define('RegistrationInvite', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    tokenHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'token_hash'
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        isEmail: true
      }
    },
    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [['mentor', 'mentee']]
      }
    },
    invitedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'invited_by'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at'
    },
    usedAt: {
      type: DataTypes.DATE,
      field: 'used_at'
    },
    usedBy: {
      type: DataTypes.UUID,
      field: 'used_by'
    },
    revokedAt: {
      type: DataTypes.DATE,
      field: 'revoked_at'
    },
    // Placement baked into the invite - the source of truth for enrollment.
    // Mentee invites carry a program; mentor invites carry the clan they'll
    // lead (program derived from it). clan_id is optional for mentees.
    programId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'program_id'
    },
    clanId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'clan_id'
    },
    // Intake batch this invite belongs to (set when issued from an Application).
    cohortId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'cohort_id'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    }
  }, {
    tableName: 'registration_invites',
    underscored: true,
    indexes: [
      { fields: ['token_hash'] },
      { fields: ['email'] },
      { fields: ['role'] },
      { fields: ['invited_by'] },
      { fields: ['expires_at'] },
      { fields: ['used_at'] },
      { fields: ['revoked_at'] },
      { fields: ['program_id'] },
      { fields: ['clan_id'] },
      { fields: ['cohort_id'] }
    ]
  });

  RegistrationInvite.associate = (models) => {
    RegistrationInvite.belongsTo(models.User, {
      foreignKey: 'invited_by',
      as: 'inviter',
      onDelete: 'CASCADE'
    });
    RegistrationInvite.belongsTo(models.Organization, { foreignKey: 'organization_id', as: 'organization' });
    RegistrationInvite.belongsTo(models.User, {
      foreignKey: 'used_by',
      as: 'usedByUser',
      onDelete: 'SET NULL'
    });
    RegistrationInvite.belongsTo(models.Program, {
      foreignKey: 'program_id',
      as: 'program',
      onDelete: 'SET NULL'
    });
    RegistrationInvite.belongsTo(models.Clan, {
      foreignKey: 'clan_id',
      as: 'clan',
      onDelete: 'SET NULL'
    });
  };

  return RegistrationInvite;
};
