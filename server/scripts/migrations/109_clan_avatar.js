const { Sequelize } = require('sequelize');
const db = require('./_db');
async function up() {
  const qi = db.getQueryInterface();
  const columns = await qi.describeTable('clans');
  if (!columns.avatar_url) await qi.addColumn('clans', 'avatar_url', { type: Sequelize.TEXT, allowNull: true });
}
async function down() { await db.getQueryInterface().removeColumn('clans', 'avatar_url'); }
if (require.main === module) up().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.close());
module.exports = { up, down };
