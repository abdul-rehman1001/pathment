module.exports = (sequelize, DataTypes) => {
  const Roadmap = sequelize.define('Roadmap', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
    programId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'program_id'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    isBaseRoadmap: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_base_roadmap'
    },
    adaptedFrom: {
      type: DataTypes.UUID,
      field: 'adapted_from'
    },
    generatedByAi: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'generated_by_ai'
    },
    aiModelVersion: {
      type: DataTypes.STRING(50),
      field: 'ai_model_version'
    },
    generationPrompt: {
      type: DataTypes.TEXT,
      field: 'generation_prompt'
    },
    totalWeeks: {
      type: DataTypes.INTEGER,
      field: 'total_weeks'
    },
    totalTasks: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'total_tasks'
    },
    estimatedTotalHours: {
      type: DataTypes.INTEGER,
      field: 'estimated_total_hours'
    },
    // Linear-roadmap template fields. Existing program-curriculum roadmaps are
    // 'org' + published; mentors author 'local' ones and may import an org one.
    source: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'org',
      validate: { isIn: [['org', 'local']] }
    },
    published: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    importedFrom: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'imported_from'
    },
    ownerMentorId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'owner_mentor_id'
    },
    skillTags: {
      type: DataTypes.ARRAY(DataTypes.STRING(40)),
      allowNull: false,
      defaultValue: [],
      field: 'skill_tags'
    }
  }, {
    tableName: 'roadmaps',
    underscored: true,
    indexes: [
      { fields: ['program_id'] },
      { fields: ['is_base_roadmap'] }
    ]
  });

  Roadmap.associate = (models) => {
    Roadmap.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    Roadmap.belongsTo(models.Roadmap, { foreignKey: 'adapted_from', as: 'parentRoadmap' });
    Roadmap.hasMany(models.AdaptiveRecommendation, { foreignKey: 'current_roadmap_id', as: 'recommendations' });
    // Linear steps: RoadmapTasks linked directly to the roadmap, ordered by task_order.
    Roadmap.hasMany(models.RoadmapTask, { foreignKey: 'roadmap_id', as: 'steps' });
    Roadmap.belongsTo(models.User, { foreignKey: 'owner_mentor_id', as: 'owner' });
    Roadmap.hasMany(models.RoadmapProgress, { foreignKey: 'roadmap_id', as: 'progress' });
  };

  return Roadmap;
};
