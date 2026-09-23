const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DataTypes } = require('sequelize');
const withPostgres = require('../helpers/privatePostgres.cjs');
const { up, TABLES } = require('../../scripts/migrations/114_workspace_model_ownership');

test('migration 114 upgrades the complete legacy model schema without losing profiles', async () => {
  await withPostgres(async db => {
    // Load model factories without the new beforeDefine ownership hook. This is
    // the schema deployed before 114, including its real FKs and unique keys.
    const models = {};
    const load = directory => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) load(file);
        else if (entry.name.endsWith('.js') && entry.name !== 'index.js') {
          const result = require(file)(db, DataTypes);
          for (const model of Array.isArray(result) ? result : [result]) models[model.name] = model;
        }
      }
    };
    load(path.resolve(__dirname, '../../src/models'));
    Object.assign(models, require('../../src/features/rag/models')(db));
    for (const model of Object.values(models)) model.associate?.(models);
    await db.sync();
    const organization = await models.Organization.create({ name: 'DevWeekends', slug: 'devweekends' });
    const user = await models.User.create({ email: 'preserve@example.com', firstName: 'Existing', lastName: 'User', role: 'mentee', passwordHash: 'unchanged' });
    const profile = await models.MenteeProfile.create({ userId: user.id, totalPoints: 123 });
    await up({ db, maintenance: true });
    const [[preserved]] = await db.query('SELECT total_points, organization_id FROM mentee_profiles WHERE id=:id', { replacements: { id: profile.id } });
    assert.equal(preserved.total_points, 123);
    assert.equal(preserved.organization_id, organization.id);
    const [columns] = await db.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='organization_id' AND table_name IN (:tables)", { replacements: { tables: TABLES } });
    assert.equal(columns.length, TABLES.length);
    await up({ db, maintenance: true });
    assert.equal(await models.User.count(), 1);
    assert.equal((await models.User.findByPk(user.id)).passwordHash, 'unchanged');
  });
});
