module.exports = (sequelize, DataTypes) => {
  /**
   * ClanJoinRequest — a mentee asking to join a clan via the public joining
   * link (`source = public_link`). Membership is created only when the current
   * Lead Mentor approves. Distinct from RegistrationInvite (email-locked) and
   * ClanChangeRequest (transfer between clans).
   */
  const ClanJoinRequest = sequelize.define('ClanJoinRequest', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    clanId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'clan_id'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'approved', 'rejected', 'cancelled']]
      }
    },
    source: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'public_link',
      validate: {
        isIn: [['public_link']]
      }
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    resolutionNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'resolution_note'
    },
    reviewedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'reviewed_by'
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reviewed_at'
    }
  }, {
    tableName: 'clan_join_requests',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['clan_id', 'status'] },
      { fields: ['user_id', 'status'] },
      { fields: ['status'] }
      // Partial unique (one pending per user+clan) is created in migration 096
      // via raw SQL — Sequelize indexes cannot express WHERE status = 'pending'.
    ]
  });

  ClanJoinRequest.associate = (models) => {
    ClanJoinRequest.belongsTo(models.Clan, { foreignKey: 'clan_id', as: 'clan' });
    ClanJoinRequest.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    ClanJoinRequest.belongsTo(models.User, { foreignKey: 'reviewed_by', as: 'reviewer' });
    if (models.User) {
      models.User.hasMany(ClanJoinRequest, { foreignKey: 'user_id', as: 'clanJoinRequests' });
    }
  };

  return ClanJoinRequest;
};
