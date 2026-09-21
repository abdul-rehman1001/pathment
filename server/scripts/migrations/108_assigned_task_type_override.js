const { Sequelize } = require('sequelize');
const db = require('./_db');

async function up() {
  const qi = db.getQueryInterface();
  const columns = await qi.describeTable('assigned_tasks');
  if (!columns.type_override) {
    await qi.addColumn('assigned_tasks', 'type_override', {
      type: Sequelize.STRING(20), allowNull: true,
    });
  }
}

async function down() {
  const qi = db.getQueryInterface();
  const columns = await qi.describeTable('assigned_tasks');
  if (columns.type_override) await qi.removeColumn('assigned_tasks', 'type_override');
}

if (require.main === module) {
  up().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
}
module.exports = { up, down };
