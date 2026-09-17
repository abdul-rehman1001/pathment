'use strict';

/**
 * "Why did this person get that certificate?"
 *
 * Two things are pinned here.
 *
 * COMPLETION RATE measures progress through the ROADMAP: of the roadmap tasks
 * assigned to somebody, how many are done. It used to count every assigned
 * task, custom one-offs included — so two mentees with identical roadmap
 * progress scored differently because a mentor had added ad-hoc work to one of
 * them, and a tier threshold like "80% completion" meant something different
 * per person. A threshold is only meaningful against a fixed syllabus.
 *
 * THE EVIDENCE PAYLOAD is what both portals read to answer the question, so it
 * has to work before any AI run (the numbers come from the record, not a stored
 * result), it has to carry a mentor's override and their reason, and it has to
 * be scoped exactly like every other read — a mentor sees their own clan.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const certificateService = require('../../src/services/certificateService');
const verification = require('../../src/services/certificateVerificationService');
const {
  cleanDb, createAdmin, createMentor, createMentee, createProgram,
  createRoadmap, createRoadmapTask, createEnrollment
} = require('../helpers/seed');

describe('certificate evidence for one mentee', () => {
  let admin, lead, outsider, mentee, otherMentee;
  let program, clan, otherClan, roadmap, template, enrollment;

  /** Assign a roadmap task, or a custom one-off, at a given status. */
  const assign = async ({ custom = false, status = 'assigned', title = 'Task' } = {}) => {
    const roadmapTask = await createRoadmapTask({ roadmapId: custom ? null : roadmap.id, title });
    return models.AssignedTask.create({
      roadmapTaskId: roadmapTask.id,
      menteeId: mentee.id,
      mentorId: lead.id,
      enrollmentId: enrollment.id,
      status,
      isCustomTask: custom,
      dueDate: new Date(Date.now() + 7 * 86400000),
      isLate: false,
      pointsAwarded: status === 'completed' ? 10 : 0
    });
  };

  beforeEach(async () => {
    await cleanDb();
    await models.CertificateTemplate.destroy({ where: {}, force: true });

    admin = await createAdmin({ email: 'ev-admin@test.com' });
    lead = await createMentor({ email: 'ev-lead@test.com' });
    outsider = await createMentor({ email: 'ev-outsider@test.com' });
    mentee = await createMentee({ email: 'ev-mentee@test.com' });
    otherMentee = await createMentee({ email: 'ev-other@test.com' });

    program = await createProgram({ createdBy: admin.id });
    roadmap = await createRoadmap({ programId: program.id, createdBy: admin.id });

    clan = await models.Clan.create({
      programId: program.id, name: 'Viral Loop', leadMentorId: lead.id, createdBy: admin.id
    });
    otherClan = await models.Clan.create({
      programId: program.id, name: 'Core Team', leadMentorId: outsider.id, createdBy: admin.id
    });
    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });
    await clanService.addMember(otherClan.id, { userId: outsider.id, role: 'lead_mentor' });
    await clanService.addMember(otherClan.id, { userId: otherMentee.id, role: 'mentee' });

    enrollment = await createEnrollment({ menteeId: mentee.id, programId: program.id, status: 'active' });

    template = await certificateService.createTemplate(
      {
        name: 'Fellowship',
        config: [],
        criteria: [
          { id: 'gold', name: 'Gold', minCompletionRate: 80 },
          { id: 'participation', name: 'Participation' }
        ],
        programId: program.id
      },
      admin.id
    );
  });

  describe('completion rate', () => {
    it('measures roadmap tasks only, ignoring custom one-offs', async () => {
      // 3 of 4 roadmap tasks done = 75%.
      await assign({ status: 'completed' });
      await assign({ status: 'completed' });
      await assign({ status: 'completed' });
      await assign({ status: 'assigned' });
      // Two custom tasks, both unfinished. Counting them would drag this to 50%.
      await assign({ custom: true, status: 'assigned' });
      await assign({ custom: true, status: 'assigned' });

      const ev = await certificateService.getMenteeEvidence(template.id, mentee.id, admin);

      expect(ev.metrics.completion_rate).toBe(75);
      expect(ev.metrics.completion_basis).toMatchObject({
        basis: 'roadmap',
        counted_total: 4,
        counted_completed: 3,
        custom_total: 2,
        custom_completed: 0
      });
    });

    it('falls back to all assigned work when no roadmap task was ever assigned', async () => {
      // 0% here would read as "did nothing" when the truth is "nothing from a
      // roadmap was assigned" — a different statement entirely.
      await assign({ custom: true, status: 'completed' });
      await assign({ custom: true, status: 'assigned' });

      const ev = await certificateService.getMenteeEvidence(template.id, mentee.id, admin);

      expect(ev.metrics.completion_rate).toBe(50);
      expect(ev.metrics.completion_basis.basis).toBe('all_assigned');
    });

    it('is 0 with nothing assigned at all, and says so', async () => {
      const ev = await certificateService.getMenteeEvidence(template.id, mentee.id, admin);
      expect(ev.metrics.completion_rate).toBe(0);
      expect(ev.metrics.completion_basis.counted_total).toBe(0);
    });
  });

  describe('the payload', () => {
    it('answers before any AI run, from the record', async () => {
      await assign({ status: 'completed' });

      const ev = await certificateService.getMenteeEvidence(template.id, mentee.id, lead);

      expect(ev.ai).toBeNull();
      expect(ev.mentee.id).toBe(mentee.id);
      expect(ev.clan.name).toBe('Viral Loop');
      expect(ev.metrics.completion_rate).toBe(100);
      // Thresholds are recomputed here, not read from a stale evaluation.
      expect(ev.constraints.hardChecks.gold.completion_rate_ok).toBe(true);
    });

    it('reports a tier the mentee falls short of as failing, with the real number', async () => {
      await assign({ status: 'completed' });
      await assign({ status: 'assigned' });   // 50%, under Gold's 80

      const ev = await certificateService.getMenteeEvidence(template.id, mentee.id, lead);

      expect(ev.metrics.completion_rate).toBe(50);
      expect(ev.constraints.hardChecks.gold.completion_rate_ok).toBe(false);
      expect(ev.constraints.maxEligibleTier).toBe('participation');
    });

    it('carries a mentor override and the reason they gave', async () => {
      await verification.open(template.id, [
        { mentee_id: mentee.id, certificate_tier: 'participation', match_score: 64 }
      ], { notify: false });

      await verification.verify(
        template.id, mentee.id,
        { finalTier: 'gold', reason: 'Carried the clan through a bad month' },
        lead
      );

      const ev = await certificateService.getMenteeEvidence(template.id, mentee.id, admin);

      expect(ev.verification).toMatchObject({
        status: 'verified',
        aiTier: 'participation',
        finalTier: 'gold',
        overridden: true,
        overrideReason: 'Carried the clan through a bad month'
      });
      expect(ev.verification.verifiedBy).toContain('Test');
    });

    it('refuses an override with no reason', async () => {
      await verification.open(template.id, [
        { mentee_id: mentee.id, certificate_tier: 'participation', match_score: 64 }
      ], { notify: false });

      await expect(
        verification.verify(template.id, mentee.id, { finalTier: 'gold' }, lead)
      ).rejects.toThrow(/why/i);
    });
  });

  describe('scope', () => {
    it('lets a mentor read their own clan', async () => {
      const ev = await certificateService.getMenteeEvidence(template.id, mentee.id, lead);
      expect(ev.mentee.id).toBe(mentee.id);
    });

    it('refuses a mentor somebody else\'s mentee', async () => {
      await expect(
        certificateService.getMenteeEvidence(template.id, otherMentee.id, lead)
      ).rejects.toThrow(/denied/i);
    });

    it('lets a mentee read their own', async () => {
      const ev = await certificateService.getMenteeEvidence(template.id, mentee.id, mentee);
      expect(ev.mentee.id).toBe(mentee.id);
    });

    it('refuses a mentee somebody else\'s', async () => {
      await expect(
        certificateService.getMenteeEvidence(template.id, otherMentee.id, mentee)
      ).rejects.toThrow(/denied/i);
    });
  });
});
