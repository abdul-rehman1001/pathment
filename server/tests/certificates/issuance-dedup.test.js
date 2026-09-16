'use strict';

/**
 * Nobody receives the same certificate twice.
 *
 * Both an admin and a mentor can issue for the same clan, often from rosters
 * loaded minutes apart, so a second send for the same people is ordinary
 * traffic rather than a mistake. The already-issued are skipped and reported;
 * everyone else still gets theirs. Refusing the whole batch would let one
 * duplicate block a cohort.
 *
 * The application check cannot be the whole answer — check-then-insert races —
 * so a unique index backs it (migration 100).
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const certificateService = require('../../src/services/certificateService');
const { cleanDb, createAdmin, createMentor, createMentee, createProgram } = require('../helpers/seed');

describe('certificate issuance is idempotent per mentee', () => {
  let admin, lead, alice, bob, program, clan, template;

  beforeEach(async () => {
    await cleanDb();
    await models.CertificateVerification.destroy({ where: {}, force: true });
    await models.CertificateInstance.destroy({ where: {}, force: true });
    await models.CertificateTemplate.destroy({ where: {}, force: true });

    admin = await createAdmin({ email: 'admin@test.com' });
    lead = await createMentor({ email: 'lead@test.com' });
    alice = await createMentee({ email: 'alice@test.com' });
    bob = await createMentee({ email: 'bob@test.com' });

    program = await createProgram({ createdBy: admin.id });
    clan = await models.Clan.create({ programId: program.id, name: 'Viral Loop', leadMentorId: lead.id, createdBy: admin.id });
    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
    await clanService.addMember(clan.id, { userId: alice.id, role: 'mentee' });
    await clanService.addMember(clan.id, { userId: bob.id, role: 'mentee' });

    template = await certificateService.createTemplate({
      name: 'Fellowship',
      config: [],
      criteria: [{ id: 'bronze', name: 'Bronze Certificate', artworkUrl: 'https://cdn/b.png', layout: [] }],
      programId: program.id
    }, admin.id);
  });

  const issue = (user, menteeIds) => certificateService.issueCertificates(
    { templateId: template.id, recipients: menteeIds.map((id) => ({ menteeId: id, tier: 'bronze' })) },
    user.id, user
  );

  it('issues once', async () => {
    const res = await issue(admin, [alice.id]);
    expect(res.count).toBe(1);
    expect(res.skipped).toBe(0);
  });

  it('skips somebody who already has one, and says so', async () => {
    await issue(admin, [alice.id]);
    const again = await issue(admin, [alice.id]);
    expect(again.count).toBe(0);
    expect(again.skipped).toBe(1);
    expect(again.alreadyIssued).toBe(true);
    expect(await models.CertificateInstance.count({ where: { menteeId: alice.id } })).toBe(1);
  });

  it('still issues to everyone else in a batch containing a duplicate', async () => {
    await issue(admin, [alice.id]);
    // The mentor sends the whole clan, not knowing the admin already did Alice.
    const res = await issue(lead, [alice.id, bob.id]);
    expect(res.count).toBe(1);
    expect(res.skipped).toBe(1);
    expect(await models.CertificateInstance.count()).toBe(2);
  });

  it('lets a mentor issue for their own clan', async () => {
    const res = await issue(lead, [bob.id]);
    expect(res.count).toBe(1);
  });

  it('is enforced by the database, not only by the check', async () => {
    await issue(admin, [alice.id]);
    // Simulating the race: two requests both read "not issued" before writing.
    await expect(models.CertificateInstance.create({
      templateId: template.id, menteeId: alice.id, issuedBy: admin.id,
      tier: 'bronze', certificateNumber: 'ZZZZ9999YYYY'
    })).rejects.toThrow();
  });

  it('allows re-issuing after a revocation', async () => {
    await issue(admin, [alice.id]);
    const instance = await models.CertificateInstance.findOne({ where: { menteeId: alice.id } });
    await certificateService.deleteCertificateInstance(instance.id, admin);

    const res = await issue(admin, [alice.id]);
    expect(res.count).toBe(1);
  });

  it('gives the re-issued certificate a NEW number', async () => {
    await issue(admin, [alice.id]);
    const first = (await models.CertificateInstance.findOne({ where: { menteeId: alice.id } }));
    const firstNumber = first.certificateNumber;
    await certificateService.deleteCertificateInstance(first.id, admin);
    await issue(admin, [alice.id]);

    const second = await models.CertificateInstance.findOne({ where: { menteeId: alice.id } });
    expect(second.certificateNumber).not.toBe(firstNumber);
  });
});
