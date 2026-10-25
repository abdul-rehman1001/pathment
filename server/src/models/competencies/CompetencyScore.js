module.exports = (sequelize, DataTypes) => {
  /**
   * CompetencyScore - one judgement, about one person, on one competency.
   *
   * `sourceType` is the whole design. A score given in a live discussion, on a
   * submission, or while grading an interview is the same claim about the same
   * person, so it lives in one table rather than three. Without that, each
   * surface grows its own scoring column, they drift, and the mentee's profile
   * ends up with three numbers for "communication" that disagree.
   *
   * The scale is four, on purpose: a five point scale has a middle, and the
   * middle is where a tired reviewer puts everybody.
   */
  const CompetencyScore = sequelize.define('CompetencyScore', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    competencyId: { type: DataTypes.UUID, allowNull: false, field: 'competency_id' },
    menteeId: { type: DataTypes.UUID, allowNull: false, field: 'mentee_id' },
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 4 },
    },
    note: { type: DataTypes.TEXT, allowNull: true },
    /** Where the judgement was made. */
    sourceType: {
      type: DataTypes.STRING(24),
      allowNull: false,
      field: 'source_type',
      validate: { isIn: [['review_entry', 'task_feedback', 'interview', 'assessment', 'manual']] },
    },
    sourceId: { type: DataTypes.UUID, allowNull: true, field: 'source_id' },
    scoredBy: { type: DataTypes.UUID, allowNull: true, field: 'scored_by' },
    scoredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'scored_at' },
  }, {
    tableName: 'competency_scores',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mentee_id', 'scored_at'] },
      { fields: ['source_type', 'source_id'] },
    ],
  });

  CompetencyScore.associate = (models) => {
    CompetencyScore.belongsTo(models.Competency, { foreignKey: 'competency_id', as: 'competency' });
    CompetencyScore.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    CompetencyScore.belongsTo(models.User, { foreignKey: 'scored_by', as: 'scorer' });
  };

  return CompetencyScore;
};
