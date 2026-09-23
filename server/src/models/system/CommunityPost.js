module.exports = (sequelize, DataTypes) => {
  /**
   * CommunityPost - a post inside a community space. Every post is scoped to a
   * space (clan / cohort / program / global) so the feed mirrors the org
   * hierarchy. Types: kudos (optionally to someone), win, question (Q&A - can be
   * resolved with an accepted answer), discussion, resource, meme, standup.
   * Threaded replies live in CommunityComment; reactions in CommunityReaction.
   */
  const CommunityPost = sequelize.define('CommunityPost', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    authorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'author_id'
    },
    // Recipient for a kudos post (optional).
    toId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'to_id'
    },
    type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'discussion',
      validate: { isIn: [['kudos', 'win', 'question', 'discussion', 'resource', 'meme', 'standup']] }
    },
    // ── Scope: which space this post belongs to ──────────────────────────
    scopeType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'clan',
      field: 'scope_type',
      validate: { isIn: [['clan', 'cohort', 'program', 'global']] }
    },
    // The clan/cohort/program id; null for the global lounge.
    scopeId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'scope_id'
    },
    // Optional headline (used by questions / resources).
    title: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING(40)),
      allowNull: false,
      defaultValue: []
    },
    // A single shared link (auto-previewed client-side, e.g. a GitHub repo).
    linkUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'link_url'
    },
    // Arbitrary attachment descriptors: [{ url, name, kind }].
    attachments: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    // User ids @mentioned in the body (drives notifications).
    mentionedUserIds: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: false,
      defaultValue: [],
      field: 'mentioned_user_ids'
    },
    // ── Q&A ───────────────────────────────────────────────────────────────
    resolved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    acceptedCommentId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'accepted_comment_id'
    },
    commentCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'comment_count'
    },
    // ── Moderation / lifecycle ──────────────────────────────────────────
    pinnedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'pinned_at'
    },
    pinnedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'pinned_by'
    },
    editedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'edited_at'
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at'
    }
  }, {
    tableName: 'community_posts',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['author_id'] },
      { fields: ['to_id'] },
      { fields: ['type'] },
      { fields: ['scope_type', 'scope_id'] },
      { fields: ['pinned_at'] },
      { fields: ['deleted_at'] }
    ]
  });

  CommunityPost.associate = (models) => {
    CommunityPost.belongsTo(models.User, { foreignKey: 'author_id', as: 'author' });
    CommunityPost.belongsTo(models.User, { foreignKey: 'to_id', as: 'recipient' });
    CommunityPost.hasMany(models.CommunityReaction, { foreignKey: 'post_id', as: 'reactions' });
    if (models.CommunityComment) {
      CommunityPost.hasMany(models.CommunityComment, { foreignKey: 'post_id', as: 'comments' });
    }
  };

  return CommunityPost;
};
