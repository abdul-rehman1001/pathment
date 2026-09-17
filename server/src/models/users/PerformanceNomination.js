module.exports = (sequelize, DataTypes) => {
  /**
   * PerformanceNomination — a mentee put forward as a top performer.
   *
   * An admin running a fellowship of several hundred cannot know who deserves
   * this, and cannot simply take a mentor's word for it either. So a nomination
   * carries three things that are weighed together: the mentor's REASONING, the
   * system's independent RANK for that mentee at the time, and the proof of
   * work already available behind the certificate evidence drawer.
   *
   * The disagreement is the useful part. "Nominated, and the data ranks them
   * first" needs no scrutiny; "nominated, and the data ranks them fourteenth of
   * twenty" tells an admin exactly where to look — without overruling the
   * mentor, who may well be right about something the numbers cannot see.
   *
   * Two levels, one table. A mentor nominates within their clan; the admin
   * promotes from the pooled clan nominations to a fellowship award.
   */
  const PerformanceNomination = sequelize.define('PerformanceNomination', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    menteeId: { type: DataTypes.UUID, allowNull: false, field: 'mentee_id' },
    /** Null for a system suggestion nobody has put their name to yet. */
    nominatedBy: { type: DataTypes.UUID, allowNull: true, field: 'nominated_by' },

    programId: { type: DataTypes.UUID, allowNull: false, field: 'program_id' },
    /** Required at clan level; null for a fellowship-wide award. */
    clanId: { type: DataTypes.UUID, allowNull: true, field: 'clan_id' },

    level: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'clan',
      validate: { isIn: [['clan', 'fellowship']] }
    },

    /**
     * Why. Required of a mentor — the whole point of asking a human is the part
     * the numbers cannot express, and a nomination without it is just a vote.
     */
    reasoning: { type: DataTypes.TEXT, allowNull: true },

    /** Where the data placed this mentee when the nomination was made. */
    systemRank: { type: DataTypes.INTEGER, allowNull: true, field: 'system_rank' },
    systemOutOf: { type: DataTypes.INTEGER, allowNull: true, field: 'system_out_of' },
    /** The numbers behind that rank, frozen so the record stays readable. */
    systemSignals: { type: DataTypes.JSONB, allowNull: true, field: 'system_signals' },

    status: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'nominated',
      validate: { isIn: [['nominated', 'shortlisted', 'awarded', 'declined']] }
    },

    decisionNote: { type: DataTypes.TEXT, allowNull: true, field: 'decision_note' },
    decidedBy: { type: DataTypes.UUID, allowNull: true, field: 'decided_by' },
    decidedAt: { type: DataTypes.DATE, allowNull: true, field: 'decided_at' }
  }, {
    tableName: 'performance_nominations',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mentee_id'] },
      { fields: ['program_id'] },
      { fields: ['clan_id'] },
      { fields: ['status'] }
    ]
  });

  PerformanceNomination.associate = (models) => {
    if (models.User) {
      PerformanceNomination.belongsTo(models.User, { foreignKey: 'menteeId', as: 'mentee' });
      PerformanceNomination.belongsTo(models.User, { foreignKey: 'nominatedBy', as: 'nominator' });
      PerformanceNomination.belongsTo(models.User, { foreignKey: 'decidedBy', as: 'decider' });
    }
    if (models.Clan) PerformanceNomination.belongsTo(models.Clan, { foreignKey: 'clanId', as: 'clan' });
    if (models.Program) PerformanceNomination.belongsTo(models.Program, { foreignKey: 'programId', as: 'program' });
  };

  return PerformanceNomination;
};
