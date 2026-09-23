module.exports = (sequelize, DataTypes) => {
  /**
   * Announcement - an org broadcast (one source of truth, replacing scattered
   * threads). Audience is 'all' or a specific programId. Can be pinned.
   */
  const Announcement = sequelize.define('Announcement', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    authorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'author_id'
    },
    // Audience TYPE: 'all' | 'mentors' | 'mentees' | 'program' | 'clan'.
    audience: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'all'
    },
    // For 'program' / 'clan' audiences: the target program or clan id.
    audienceId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'audience_id'
    },
    pinned: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }, {
    tableName: 'announcements',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['audience'] },
      { fields: ['pinned'] }
    ]
  });

  Announcement.associate = (models) => {
    Announcement.belongsTo(models.User, { foreignKey: 'author_id', as: 'author' });
    Announcement.hasMany(models.AnnouncementReaction, { foreignKey: 'announcement_id', as: 'reactions' });
  };

  return Announcement;
};
