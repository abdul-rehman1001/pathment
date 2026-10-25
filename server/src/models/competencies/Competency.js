module.exports = (sequelize, DataTypes) => {
  /**
   * Competency - one thing a workspace judges people on, by name.
   *
   * Reasoning, communication, ownership, adaptability: the qualities an
   * employer interviews for and that nothing on this platform could see
   * before, because every number here comes from an artifact - was it
   * submitted, was it on time, how was it rated.
   *
   * Kept deliberately few. A mentor with fifteen mentees, asked to score a
   * dozen competencies during a live call, clicks the same value down the
   * column and the data is worthless; the limit is enforced in the service
   * rather than here so the reason can be explained rather than thrown.
   */
  const Competency = sequelize.define('Competency', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
    /** Lower-cased name, so "Ownership" and "ownership" are one competency. */
    nameKey: { type: DataTypes.STRING(80), allowNull: false, field: 'name_key' },
    /** What a scorer should actually be looking for. Shown on the rubric. */
    description: { type: DataTypes.TEXT, allowNull: true },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    /** Retired rather than deleted: old scores must keep their meaning. */
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdBy: { type: DataTypes.UUID, allowNull: true, field: 'created_by' },
  }, {
    tableName: 'competencies',
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['active', 'position'] }],
  });

  Competency.associate = (models) => {
    Competency.hasMany(models.CompetencyScore, { foreignKey: 'competency_id', as: 'scores' });
    Competency.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
  };

  return Competency;
};
