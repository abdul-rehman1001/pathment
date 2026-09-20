const { models, sequelize } = require('../../src/db');
const { saveResults } = require('../../src/services/certificateEvaluationStore');
const certificateService = require('../../src/services/certificateService');
const verification = require('../../src/services/certificateVerificationService');
const clanService = require('../../src/services/clanService');
const { cleanDb, createAdmin, createMentor, createMentee, createProgram } = require('../helpers/seed');

describe('durable certificate AI assignments', () => {
  let admin, mentor, mentees, template;
  const result = (mentee, tier, time = '2026-09-20T10:00:00Z') => ({
    mentee_id: mentee.id, certificate_tier: tier, match_score: 80, evaluatedAt: time
  });
  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin();
    mentor = await createMentor();
    mentees = await Promise.all([0, 1, 2].map(i => createMentee({ email: `recipient${i}@test.com` })));
    const program = await createProgram({ createdBy: admin.id });
    const clan = await models.Clan.create({ programId: program.id, name: 'Review clan', leadMentorId: mentor.id, createdBy: admin.id });
    await clanService.addMember(clan.id, { userId: mentor.id, role: 'lead_mentor' });
    for (const mentee of mentees) await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });
    template = await certificateService.createTemplate({ name: 'Fellowship', programId: program.id, config: [],
      criteria: ['silver', 'bronze', 'participation'].map(id => ({ id, name: id })) }, admin.id);
  });
  const saved = async () => (await template.reload()).aiEvaluation.results;
  const assigned = async user => (await certificateService.getQualification(template.id, null, user)).participation;

  it('retains other mentees across partial runs and concurrent batches', async () => {
    await saveResults(template.id, [result(mentees[0], 'participation')]);
    await Promise.all([
      saveResults(template.id, [result(mentees[1], 'bronze')]),
      saveResults(template.id, [result(mentees[2], 'silver')])
    ]);
    expect(await saved()).toHaveLength(3);
    for (const user of [admin, mentor]) {
      const rows = await assigned(user);
      expect(rows.find(r => r.id === mentees[0].id).assignedTier).toBe('participation');
      expect(rows.find(r => r.id === mentees[1].id).assignedTier).toBe('bronze');
    }
  });

  it('does not let an older or failed run overwrite the newer grade', async () => {
    await saveResults(template.id, [result(mentees[0], 'silver')]);
    await saveResults(template.id, [result(mentees[0], 'bronze', '2026-09-19T10:00:00Z')]);
    await saveResults(template.id, [{ ...result(mentees[0], 'participation'), _failed: true }]);
    expect((await saved())[0].certificate_tier).toBe('silver');
  });

  it('keeps the dispatched assignment through re-evaluation, verification and approval', async () => {
    await saveResults(template.id, [result(mentees[0], 'bronze')]);
    await verification.sendToClans(template.id, {}, admin);
    await saveResults(template.id, [result(mentees[0], 'silver', '2026-09-21T10:00:00Z')]);
    expect((await assigned(mentor)).find(r => r.id === mentees[0].id).assignedTier).toBe('bronze');
    await expect(verification.verify(template.id, mentees[0].id, { finalTier: 'silver' }, mentor)).rejects.toThrow();
    await verification.verify(template.id, mentees[0].id, { finalTier: 'silver', reason: 'Delivered exceptional work beyond the assigned roadmap.' }, mentor);
    expect((await assigned(admin)).find(r => r.id === mentees[0].id).assignedTier).toBe('silver');
    const review = await models.CertificateVerification.findOne({ where: { templateId: template.id, menteeId: mentees[0].id } });
    expect(review.aiTier).toBe('bronze');
    expect(review.overridden).toBe(true);
    const issue = () => certificateService.issueCertificates({ templateId: template.id, recipients: [{ menteeId: mentees[0].id, tier: 'silver' }] }, mentor.id, mentor);
    await expect(issue()).rejects.toThrow(/not been approved/i);
    await verification.approveClan(template.id, review.clanId, {}, admin);
    expect((await issue()).count).toBe(1);
    expect((await issue()).count).toBe(0);
  });

  it('leaves an unevaluated mentee unassigned', async () => {
    await saveResults(template.id, [result(mentees[0], 'bronze')]);
    expect((await assigned(mentor)).find(r => r.id === mentees[1].id).assignedTier).toBeNull();
  });
  it('repairs missing results with a dry run, preserves current results, and is idempotent', async () => {
    const { up } = require('../../scripts/migrations/105_restore_certificate_ai_results');
    await saveResults(template.id, [result(mentees[0], 'bronze'), result(mentees[1], 'silver')]);
    await verification.sendToClans(template.id, {}, admin);
    await template.reload();
    await template.update({ aiEvaluation: { results: [result(mentees[0], 'participation')], metadata: 'keep' } });
    await models.AIEvaluationQueue.create({
      runId: require('crypto').randomUUID(), templateId: template.id, menteeId: mentees[2].id,
      menteePayload: { id: mentees[2].id }, triggeredBy: admin.id, status: 'completed',
      result: { ...result(mentees[2], 'bronze'), reasoning: 'Completed the required project.' }
    });
    expect(await up({ db: sequelize, dryRun: true })).toBe(2);
    expect(await saved()).toHaveLength(1);
    expect(await up({ db: sequelize })).toBe(2);
    const restored = await saved();
    expect(restored.find(r => r.mentee_id === mentees[0].id).certificate_tier).toBe('participation');
    expect(restored.find(r => r.mentee_id === mentees[1].id)).toMatchObject({ certificate_tier: 'silver', restored_from_review: true });
    expect(restored.find(r => r.mentee_id === mentees[2].id).reasoning).toBe('Completed the required project.');
    expect(template.aiEvaluation.metadata).toBe('keep');
    expect(await up({ db: sequelize })).toBe(0);
  });

  it('persists worker batches before marking queue results complete', async () => {
    const { tickAIEval } = require('../../src/workers/certificateWorker');
    await saveResults(template.id, [result(mentees[0], 'bronze')]);
    await models.AIEvaluationQueue.create({
      runId: require('crypto').randomUUID(), templateId: template.id,
      menteeId: mentees[1].id, menteePayload: { id: mentees[1].id },
      triggeredBy: admin.id, status: 'pending'
    });
    const evaluate = jest.spyOn(certificateService, 'evaluateBatchMentees').mockResolvedValue([
      { menteeId: mentees[1].id, result: result(mentees[1], 'silver') }
    ]);
    try {
      await tickAIEval();
      expect(await saved()).toHaveLength(2);
      const job = await models.AIEvaluationQueue.findOne({ where: { templateId: template.id } });
      expect(job.status).toBe('completed');
      expect((await saved()).find(r => r.mentee_id === mentees[1].id).certificate_tier).toBe('silver');
    } finally { evaluate.mockRestore(); }
  });

});
