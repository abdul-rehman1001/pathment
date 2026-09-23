module.exports = (sequelize, DataTypes) => {
  const TaskSubmission = sequelize.define('TaskSubmission', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    assignedTaskId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'assigned_task_id'
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    submissionText: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'submission_text'
    },
    submissionUrls: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      field: 'submission_urls',
      defaultValue: []
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'approved', 'revision_needed', 'reviewing', 'superseded']]
      }
    },
    extensionRequested: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'extension_requested'
    },
    extensionReason: {
      type: DataTypes.TEXT,
      field: 'extension_reason'
    },
    extensionDays: {
      type: DataTypes.INTEGER,
      field: 'extension_days'
    },
    extensionStatus: {
      type: DataTypes.STRING(20),
      field: 'extension_status',
      validate: {
        isIn: [['pending', 'approved', 'rejected', null]]
      }
    },
    submittedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'submitted_at'
    },
    reviewedAt: {
      type: DataTypes.DATE,
      field: 'reviewed_at'
    }
  }, {
    tableName: 'task_submissions',
    underscored: true,
    timestamps: false,
    indexes: [
      { unique: true, fields: ['assigned_task_id', 'version'] },
      { fields: ['assigned_task_id'] },
      { fields: ['status'] }
    ]
  });

  TaskSubmission.associate = (models) => {
    TaskSubmission.belongsTo(models.AssignedTask, { foreignKey: 'assigned_task_id', as: 'assignedTask' });
    TaskSubmission.hasMany(models.TaskSubmissionFile, { foreignKey: 'submission_id', as: 'files' });
    TaskSubmission.hasMany(models.TaskFeedback, { foreignKey: 'submission_id', as: 'feedback' });
  };

  return TaskSubmission;
};
