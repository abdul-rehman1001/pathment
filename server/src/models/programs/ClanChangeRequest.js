module.exports = (sequelize, DataTypes) => {
  /**
   * ClanChangeRequest - a request to move a mentee from one clan to another.
   * On approval the mentee's clan membership is actually moved.
   *
   * Three origins share this table so admins see ONE queue:
   *   - 'admin'  : raised (and resolved) from the admin requests page.
   *   - 'mentor' : a mentor/co-mentor asked another clan to take their mentee;
   *                the TARGET clan's lead (or a permitted co-mentor) decides.
   *   - 'mentee' : the mentee asked to be moved. Only an admin decides these,
   *                and `toClanId` may be null - see below.
   */
  const ClanChangeRequest = sequelize.define('ClanChangeRequest', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    menteeId: { type: DataTypes.UUID, allowNull: false, field: 'mentee_id' },
    fromClanId: { type: DataTypes.UUID, allowNull: true, field: 'from_clan_id' },
    /**
     * Where they are going - or, for a mentee's own ask, where they would
     * LIKE to go, which may be nowhere in particular.
     *
     * Null is meaningful and only reachable from origin 'mentee': the mentee
     * asked to move and left the destination to the admin, who supplies it
     * when they approve. The other two origins always name it, because in
     * both of them somebody with the roster in front of them already chose.
     */
    toClanId: { type: DataTypes.UUID, allowNull: true, field: 'to_clan_id' },
    reason: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      // 'cancelled' = the requester withdrew it before anyone decided.
      validate: { isIn: [['pending', 'approved', 'denied', 'cancelled']] }
    },
    /** Who raised it: the admin console, a mentor asking another clan, or the mentee. */
    origin: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'admin',
      validate: { isIn: [['admin', 'mentor', 'mentee']] }
    },
    resolutionNote: { type: DataTypes.TEXT, allowNull: true, field: 'resolution_note' },
    resolvedBy: { type: DataTypes.UUID, allowNull: true, field: 'resolved_by' },
    resolvedAt: { type: DataTypes.DATE, allowNull: true, field: 'resolved_at' },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' }
  }, {
    tableName: 'clan_change_requests',
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['mentee_id'] }, { fields: ['status'] }, { fields: ['to_clan_id', 'status'] }]
  });

  ClanChangeRequest.associate = (models) => {
    ClanChangeRequest.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    ClanChangeRequest.belongsTo(models.User, { foreignKey: 'created_by', as: 'requester' });
    ClanChangeRequest.belongsTo(models.User, { foreignKey: 'resolved_by', as: 'resolver' });
    ClanChangeRequest.belongsTo(models.Clan, { foreignKey: 'from_clan_id', as: 'fromClan' });
    ClanChangeRequest.belongsTo(models.Clan, { foreignKey: 'to_clan_id', as: 'toClan' });
  };

  return ClanChangeRequest;
};
