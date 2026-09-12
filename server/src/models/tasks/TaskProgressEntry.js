module.exports = (sequelize, DataTypes) => {
  /**
   * TaskProgressEntry - what a mentee did on ONE assigned task on ONE day.
   *
   * Deliberately separate from DailyLogEntry. That table answers "did you show up
   * today" and is keyed one row per mentee per day; this one answers "what
   * happened on this task". Folding them together would have made
   * `daily_log_entries.tasks_done` a second source of truth for the same fact,
   * and the mobile app already reads that table's current shape.
   *
   * Writing one of these ALSO upserts the day's DailyLogEntry, so logging
   * progress on a task counts toward the streak. See taskProgressService.
   */
  const TaskProgressEntry = sequelize.define('TaskProgressEntry', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    assignedTaskId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'assigned_task_id'
    },
    // Denormalised from the task so "did this mentee log anything today" is one
    // index hit rather than a join through assigned_tasks.
    menteeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentee_id'
    },
    // The calendar day in the MENTEE's own timezone, resolved server side.
    // Never take this from the client: someone logging at 2am in Karachi must
    // get their day, not UTC's.
    dateKey: {
      type: DataTypes.STRING(10),
      allowNull: false,
      field: 'date_key'
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    // Shipped but hidden in the UI. A guessed number is worse than none, so the
    // column exists for when someone actually asks for it.
    minutesSpent: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'minutes_spent'
    }
  }, {
    tableName: 'task_progress_entries',
    underscored: true,
    timestamps: true,
    indexes: [
      // One entry per task per day, so "logged 3 of 4 days" means something.
      { unique: true, fields: ['assigned_task_id', 'date_key'] },
      { fields: ['mentee_id', 'date_key'] }
    ]
  });

  TaskProgressEntry.associate = (models) => {
    TaskProgressEntry.belongsTo(models.AssignedTask, { foreignKey: 'assigned_task_id', as: 'task' });
    TaskProgressEntry.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    models.AssignedTask.hasMany(TaskProgressEntry, { foreignKey: 'assigned_task_id', as: 'progressEntries' });
  };

  return TaskProgressEntry;
};
