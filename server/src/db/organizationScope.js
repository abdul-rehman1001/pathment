const { Op, literal } = require('sequelize');
const { ForbiddenError } = require('../utils/errors/errorTypes');

/** ORM boundary for tenant-owned rows. Raw SQL still needs explicit predicates. */
module.exports = function installOrganizationScope(sequelize, models) {
  const context = () => require('../utils/auditContext').getRequestContext();
  const and = (where, restriction) => where ? { [Op.and]: [where, restriction] } : restriction;
  const identityKeys = { User: 'id', MentorProfile: 'userId', MenteeProfile: 'userId' };

  function restriction(model, ctx) {
    if (!ctx.organizationId) return null;
    // Bulk destroy hooks run after Sequelize maps attributes to SQL columns.
    // Use the physical name so a scoped DELETE never references organizationId.
    if (model?.rawAttributes?.organizationId) return {
      [model.rawAttributes.organizationId.field || 'organizationId']: ctx.organizationId,
    };
    const key = identityKeys[model?.name];
    // Authentication resolves the global identity first. After authentication,
    // directory/profile reads must prove membership in this workspace.
    if (key && ctx.userId) return { [key]: { [Op.in]: literal(
      `(SELECT user_id FROM organization_memberships WHERE organization_id = ${sequelize.escape(ctx.organizationId)} AND status IN ('active', 'suspended'))`
    ) } };
    return null;
  }

  function scopeIncludes(parent, includes, ctx) {
    for (const include of includes || []) {
      const association = typeof include.association === 'string'
        ? parent.associations[include.association] : include.association;
      const model = include.model || association?.target || parent.associations[include.as]?.target;
      if (!model) continue;
      const clause = restriction(model, ctx);
      if (clause) {
        // Adding a security predicate must not turn an optional association
        // into an INNER JOIN (e.g. an admin need not have a mentee profile).
        if (include.required === undefined) include.required = Boolean(include.where);
        include.where = and(include.where, clause);
      }
      const throughModel = association?.through?.model;
      const throughClause = throughModel && restriction(throughModel, ctx);
      if (throughClause) {
        include.through = include.through || {};
        include.through.where = and(include.through.where, throughClause);
      }
      scopeIncludes(model, include.include, ctx);
    }
  }

  for (const model of Object.values(models)) {
    const scope = (options = {}) => {
      if (options.skipOrganizationScope) return;
      const ctx = context();
      const clause = restriction(model, ctx);
      if (clause) options.where = and(options.where, clause);
      scopeIncludes(model, options.include, ctx);
    };
    model.addHook('beforeFindAfterExpandIncludeAll', scope);
    model.addHook('beforeCount', scope);
    if (!model.rawAttributes.organizationId) continue;
    model.addHook('beforeBulkUpdate', scope);
    model.addHook('beforeBulkDestroy', scope);

    async function stamp(instance, options = {}) {
      if (options.skipOrganizationScope) return;
      const current = context().organizationId;
      if (current && instance.organizationId && instance.organizationId !== current) {
        throw new ForbiddenError('Cannot write a record belonging to another workspace');
      }
      if (!instance.isNewRecord && instance.changed('organizationId')) {
        throw new ForbiddenError('Workspace ownership cannot be changed');
      }
      if (instance.organizationId) return;
      const fallback = current || (await models.Organization.findOne({
        where: { slug: process.env.DEFAULT_ORGANIZATION_SLUG || process.env.TENANT_SLUG || 'devweekends' },
        transaction: options.transaction,
      }))?.id;
      if (fallback) instance.organizationId = fallback;
    }
    model.addHook('beforeValidate', stamp);
    model.addHook('beforeSave', stamp);
    model.addHook('beforeDestroy', (row, options = {}) => {
      if (!options.skipOrganizationScope && context().organizationId &&
          row.organizationId !== context().organizationId) {
        throw new ForbiddenError('Cannot delete a record belonging to another workspace');
      }
    });
    model.addHook('beforeBulkCreate', async (rows, options) => {
      for (const row of rows) await stamp(row, options);
    });
    model.addHook('beforeBulkUpdate', (options) => {
      if (!options.skipOrganizationScope && options.attributes?.organizationId !== undefined) {
        throw new ForbiddenError('Workspace ownership cannot be changed');
      }
    });

    async function validateReferences(values, options = {}, changed = null) {
      const organizationId = context().organizationId;
      if (!organizationId || options.skipOrganizationScope) return;
      const checked = new Set();
      for (const association of Object.values(model.associations)) {
        if (association.associationType !== 'BelongsTo') continue;
        const key = association.foreignKey;
        const attribute = Object.keys(model.rawAttributes).find(name =>
          name === key || model.rawAttributes[name].field === key) || key;
        const id = values[attribute] ?? values[key];
        if (!id || (changed && !changed(attribute)) || checked.has(attribute)) continue;
        checked.add(attribute);
        if (association.target === models.User && model !== models.OrganizationMembership) {
          const membership = await models.OrganizationMembership.findOne({
            where: { organizationId, userId: id, status: { [Op.in]: ['active', 'suspended'] } },
            attributes: ['id'], transaction: options.transaction,
          });
          if (!membership) throw new ForbiddenError('Related user is not in the selected workspace');
          continue;
        }
        if (!association.target.rawAttributes.organizationId) continue;
        const parent = await association.target.findByPk(id, {
          attributes: ['id', 'organizationId'], transaction: options.transaction,
        });
        if (!parent || parent.organizationId !== organizationId) {
          throw new ForbiddenError('Related record is not in the selected workspace');
        }
      }
    }
    model.addHook('beforeSave', (row, options) => validateReferences(row, options,
      row.isNewRecord ? null : key => row.changed(key)));
    model.addHook('beforeBulkCreate', async (rows, options) => {
      for (const row of rows) await validateReferences(row, options);
    });
    model.addHook('beforeBulkUpdate', options => validateReferences(options.attributes || {}, options));
  }
};
