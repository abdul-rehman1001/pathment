/**
 * Trusted Pathment operator console. This is NOT a workspace-admin API.
 * List: node scripts/manageManualBilling.js list
 * After invoice confirmation:
 * node scripts/manageManualBilling.js activate --workspace acme --plan growth
 *   --invoice INV-2026-001 --operator operator@example.com --until 2026-12-01
 *
 * Uses the deployment DATABASE_URL. No email or payment is sent by this command.
 */
require('dotenv').config();
const { Op } = require('sequelize');
const { sequelize, models } = require('../src/db');
const { activateRequestedPlan } = require('../src/services/manualBillingService');

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'list') {
    const pending = await models.OrganizationSubscription.findAll({
      where: { requestedPlanId: { [Op.ne]: null } },
      include: [{ model: models.Organization, as: 'organization', attributes: ['slug', 'name'] },
        { model: models.Plan, as: 'requestedPlan', attributes: ['key', 'monthlyPriceCents', 'currency'] }],
      order: [['requestedAt', 'ASC']], skipOrganizationScope: true,
    });
    console.table(pending.map(row => ({ workspace: row.organization.slug,
      requestedPlan: row.requestedPlan.key, requestedAt: row.requestedAt,
      monthlyPrice: `${row.requestedPlan.monthlyPriceCents / 100} ${row.requestedPlan.currency}` })));
    return;
  }
  if (command !== 'activate' || args.length % 2 !== 0) throw new Error('Use list or activate with --workspace --plan --invoice --operator --until');
  const flags = Object.fromEntries(Array.from({ length: args.length / 2 }, (_, i) => [args[i * 2], args[i * 2 + 1]]));
  for (const name of ['--workspace', '--plan', '--invoice', '--operator', '--until']) {
    if (!flags[name]) throw new Error(`${name} is required`);
  }
  console.log(await activateRequestedPlan({ workspace: flags['--workspace'], planKey: flags['--plan'],
    invoiceReference: flags['--invoice'], operator: flags['--operator'], periodEnd: flags['--until'] }));
}

if (require.main === module) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => sequelize.close());
