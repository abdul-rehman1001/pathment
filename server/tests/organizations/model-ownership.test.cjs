const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DataTypes } = require('sequelize');
const { randomUUID } = require('node:crypto');
const withPostgres = require('../helpers/privatePostgres.cjs');
const installAttributes = require('../../src/db/workspaceModelAttributes');
const installScope = require('../../src/db/organizationScope');
const { runWithRequestContext } = require('../../src/utils/auditContext');

test('shared accounts have independent activity/profiles and cannot write foreign assessments', async () => {
  await withPostgres(async db => {
    installAttributes(db, DataTypes);
    const id = () => ({ type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 });
    const organizationId = { type: DataTypes.UUID, field: 'organization_id', allowNull: false };
    const models = {
      Organization: db.define('Organization', { id: id(), slug: DataTypes.TEXT }, { tableName: 'organizations', timestamps: false }),
      User: db.define('User', { id: id() }, { tableName: 'users', timestamps: false }),
      OrganizationMembership: require('../../src/models/platform/OrganizationMembership')(db, DataTypes),
      ActivitySession: require('../../src/models/analytics/ActivitySession')(db, DataTypes),
      MentorProfile: require('../../src/models/users/MentorProfile')(db, DataTypes),
      Assessment: db.define('Assessment', { id: id(), organizationId, name: DataTypes.TEXT }, { tableName: 'assessments', timestamps: false }),
      AssessmentQuestion: require('../../src/models/intake/AssessmentQuestion')(db, DataTypes),
    };
    models.ActivitySession.associate(models);
    models.MentorProfile.associate(models);
    models.AssessmentQuestion.belongsTo(models.Assessment, { foreignKey: 'assessmentId', as: 'assessment' });
    await db.sync();
    const first = await models.Organization.create({ slug: 'devweekends' });
    const second = await models.Organization.create({ slug: 'other' });
    const user = await models.User.create({});
    await models.OrganizationMembership.bulkCreate([first, second].map(org => ({ organizationId: org.id, userId: user.id, status: 'active' })));
    installScope(db, models);
    const inWorkspace = (org, fn) => runWithRequestContext({ organizationId: org.id, userId: user.id }, fn);
    let firstSession, foreignAssessment;
    await inWorkspace(first, async () => {
      firstSession = await models.ActivitySession.create({ userId: user.id, date: '2026-09-23', sessionStart: new Date(), activeMinutes: 10 });
      await models.MentorProfile.create({ userId: user.id, bio: 'first' });
      foreignAssessment = await models.Assessment.create({ name: 'private syllabus' });
    });
    await inWorkspace(second, async () => {
      await models.ActivitySession.create({ userId: user.id, date: '2026-09-23', sessionStart: new Date(), activeMinutes: 20 });
      await models.MentorProfile.create({ userId: user.id, bio: 'second' });
      assert.equal(await models.ActivitySession.count(), 1);
      assert.equal((await models.ActivitySession.findOne()).activeMinutes, 20);
      assert.equal(await models.ActivitySession.findByPk(firstSession.id), null);
      assert.equal(await models.MentorProfile.count(), 1);
      await models.ActivitySession.increment('activeMinutes', { by: 5, where: { userId: user.id } });
      assert.equal((await models.ActivitySession.findOne()).activeMinutes, 25);
      await firstSession.increment('activeMinutes', { by: 100 });
      assert.equal((await models.ActivitySession.update({ activeMinutes: 99 }, { where: { id: firstSession.id } }))[0], 0);
      assert.equal(await models.ActivitySession.destroy({ where: { id: firstSession.id } }), 0);
      await assert.rejects(models.AssessmentQuestion.create({ assessmentId: foreignAssessment.id, type: 'short_text', prompt: 'Steal parent' }), /Related record/);
      await assert.rejects(models.ActivitySession.create({ organizationId: first.id, userId: user.id, date: '2026-09-24', sessionStart: new Date() }), /another workspace/);
      await assert.rejects(models.ActivitySession.upsert({ id: firstSession.id, userId: user.id, date: '2026-09-23', sessionStart: new Date(), activeMinutes: 99 }), /another workspace/);
      await assert.rejects(models.ActivitySession.create({ userId: randomUUID(), date: '2026-09-24', sessionStart: new Date() }), /Related user/);
    });
    const previousGate = process.env.MULTI_TENANT_WORKSPACES_ENABLED;
    process.env.MULTI_TENANT_WORKSPACES_ENABLED = 'true';
    try {
      await assert.rejects(models.ActivitySession.findAll(), /explicit context/);
      await assert.rejects(models.ActivitySession.destroy({ where: {} }), /explicit context/);
      await assert.rejects(firstSession.destroy(), /explicit context/);
      await assert.rejects(models.ActivitySession.update({ activeMinutes: 999 }, { where: {} }), /explicit context/);
    } finally {
      if (previousGate === undefined) delete process.env.MULTI_TENANT_WORKSPACES_ENABLED;
      else process.env.MULTI_TENANT_WORKSPACES_ENABLED = previousGate;
    }
    await inWorkspace(first, async () => {
      assert.equal((await models.ActivitySession.findByPk(firstSession.id)).activeMinutes, 10);
      assert.equal(await models.AssessmentQuestion.count(), 0);
    });
  });
});
