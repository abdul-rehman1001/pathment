/** Add only named staging fixtures. No deletes, email, schema sync or production use. */
const demo = require('../src/utils/stagingWorkspaceDemo');
if (!demo.enabled() || process.env.STAGING_DEMO_CONFIRM !== 'pathment-staging') {
  throw new Error('Requires restricted staging configuration and STAGING_DEMO_CONFIRM=pathment-staging');
}
if (!/^\$2[aby]\$12\$/.test(process.env.STAGING_DEMO_PASSWORD_HASH || '')) {
  throw new Error('Supply a bcrypt cost-12 hash of a randomly generated demo password');
}
const { models, sequelize } = require('../src/db');
const { runWithRequestContext } = require('../src/utils/auditContext');
const marker = 'workspace-preview-v1';

async function seed() {
  await sequelize.transaction(async transaction => {
    await sequelize.query("SELECT pg_advisory_xact_lock(hashtext('staging-workspace-preview-v1'))", { transaction });
    const existing = await models.Organization.findAll({ where: { slug: [...demo.SLUGS] }, transaction });
    if (existing.length) {
      if (existing.length === 2 && existing.every(o => o.settings?.fixture === marker)) {
        console.log('Both demo workspaces already exist; no accounts or passwords changed.');
        return;
      }
      throw new Error('Fixture namespace collision; refusing to alter existing workspaces');
    }
    const plan = await models.Plan.findOne({ where: { key: 'starter', active: true }, transaction });
    if (!plan) throw new Error('Starter plan missing');
    let owner;
    for (const slug of demo.SLUGS) {
      const label = slug === 'demo-academy' ? 'Academy' : 'Fellowship';
      const org = await models.Organization.create({ name: `Demo ${label}`, slug,
        timezone: 'Asia/Karachi', status: 'active', settings: { fixture: marker } }, { transaction });
      await runWithRequestContext({ organizationId: org.id, organizationSlug: slug }, async () => {
        const createUser = (email, firstName, role = 'mentee') => models.User.create({
          email, firstName, lastName: label, role, status: 'active', emailVerified: true,
          emailVerifiedAt: new Date(), passwordHash: process.env.STAGING_DEMO_PASSWORD_HASH,
        }, { transaction });
        if (!owner) owner = await createUser('owner@workspace-demo.example.com', 'Demo Owner');
        await models.OrganizationMembership.findOrCreate({ where: { organizationId: org.id, userId: owner.id },
          defaults: { role: 'owner', status: 'active', joinedAt: new Date() }, transaction });
        await models.OrganizationMembership.update({ role: 'owner' }, { where: { organizationId: org.id, userId: owner.id }, transaction });
        await org.update({ createdBy: owner.id }, { transaction });
        const admin = await createUser(`admin@${slug}.example.com`, `${label} Admin`, 'admin');
        const mentor = await createUser(`mentor@${slug}.example.com`, `${label} Mentor`, 'mentor');
        const mentees = [await createUser(`mentee1@${slug}.example.com`, `${label} Learner One`),
          await createUser(`mentee2@${slug}.example.com`, `${label} Learner Two`)];
        const program = await models.Program.create({ name: `${label} Practice Program`, description: 'Synthetic staging data',
          type: 'mentorship', totalDurationWeeks: 8, createdBy: admin.id, status: 'draft' }, { transaction });
        const clan = await models.Clan.create({ name: `${label} Demo Clan`, programId: program.id,
          createdBy: admin.id, leadMentorId: mentor.id }, { transaction });
        for (const [user, role] of [[mentor, 'lead_mentor'], ...mentees.map(u => [u, 'mentee'])]) {
          await models.ClanMembership.create({ clanId: clan.id, userId: user.id, role, status: 'active' }, { transaction });
        }
        await models.OrganizationSubscription.create({ organizationId: org.id, planId: plan.id,
          status: 'active', billingInterval: 'monthly', currentPeriodStart: new Date() }, { transaction });
        console.log(`Prepared ${slug}: shared owner, admin, mentor, two mentees, program and clan.`);
      });
    }
  });
  console.log('Staging fixture transaction committed. No messages sent.');
}
seed().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => sequelize.close());
