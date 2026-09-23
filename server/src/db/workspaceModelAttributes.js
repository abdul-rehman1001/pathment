const { WORKSPACE_MODELS } = require('../config/tenantOwnership');
const { createHash } = require('node:crypto');

// Install before model factories run. Keep the ownership
// definition in one reviewed inventory instead of eighty subtly different copies.
module.exports = function workspaceModelAttributes(sequelize, DataTypes) {
  sequelize.addHook('beforeDefine', (attributes, options) => {
    const table = WORKSPACE_MODELS[options.modelName];
    if (!table) return;
    if (options.tableName !== table) throw new Error(`Unexpected table for ${options.modelName}`);
    attributes.organizationId = {
      type: DataTypes.UUID, allowNull: false, field: 'organization_id',
      references: { model: 'organizations', key: 'id' },
    };
    for (const [name, attribute] of Object.entries(attributes)) {
      if (!attribute.unique || attribute.primaryKey) continue;
      const field = attribute.field || name;
      delete attribute.unique;
      options.indexes.push({ unique: true, fields: ['organization_id', field],
        name: `${table}_org_${field}_uniq`.slice(0, 63) });
    }
    for (const index of options.indexes) {
      if (index.unique && !index.fields.includes('organization_id')) {
        index.fields = ['organization_id', ...index.fields];
        // PostgreSQL truncates identifiers at 63 bytes. Long automatic names
        // can collide, particularly when schema sync resolves cyclic models.
        if (!index.name) {
          const suffix = createHash('sha256').update(JSON.stringify(index.fields)).digest('hex').slice(0, 10);
          index.name = `${table}_org_${suffix}`;
        }
      }
    }
    options.indexes.push({ fields: ['organization_id'], name: `${table}_organization_idx` });
  });
};
