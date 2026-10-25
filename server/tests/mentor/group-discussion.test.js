'use strict';

/**
 * Group discussions and presentations, and the rubric they are scored on.
 *
 * Everything this platform measured before came from an artifact: was it
 * submitted, was it on time, how was it rated. None of that can see how
 * somebody reasons out loud, argues a position, or takes being told they are
 * wrong - which is most of what a fellowship claims to develop.
 *
 * Three decisions carry the feature, and each has a test here because each is
 * the kind that looks fine until it is live:
 *
 *   A DISCUSSION IS NOT TODAY'S REVIEW. One review per clan per day is what
 *   "today's review" means, and two of them would split the attendance in
 *   half. Two discussions in an afternoon, on different scenarios, are two
 *   different events with different scores - so they must NOT collapse into
 *   one the way reviews deliberately do.
 *
 *   RE-SCORING IS A CORRECTION. A facilitator who moves somebody from 2 to 3
 *   after hearing the rest of the room must leave one score behind, not two
 *   that average to 2.5.
 *
 *   A RETIRED COMPETENCY KEEPS ITS SCORES. They are statements somebody made
 *   about a real person, often attached to a decision about money.
 */

const { models } = require('../../src/db');
const reviewService = require('../../src/services/cohortReviewService');
const competencyService = require('../../src/services/competencyService');
const clanService = require('../../src/services/clanService');
const {
  cleanDb, createAdmin, createMentor, createMentee, createProgram, createEnrollment,
} = require('../helpers/seed');

describe('group discussions', () => {
  let admin, mentor, alice, bob, program, clan, rubric;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: `gd-admin-${Date.now()}@test.com` });
    mentor = await createMentor({ email: `gd-mentor-${Date.now()}@test.com` });
    alice = await createMentee({ email: `gd-alice-${Date.now()}@test.com` });
    bob = await createMentee({ email: `gd-bob-${Date.now()}@test.com` });

    program = await createProgram({ createdBy: admin.id, name: 'Fellowship' });
    clan = await models.Clan.create({
      programId: program.id, name: 'Clan A', leadMentorId: mentor.id, createdBy: admin.id,
    });
    await clanService.addMember(clan.id, { userId: mentor.id, role: 'lead_mentor' });
    for (const m of [alice, bob]) {
      await createEnrollment({ menteeId: m.id, programId: program.id, status: 'active' });
      await clanService.addMember(clan.id, { userId: m.id, role: 'mentee' });
    }
    rubric = await competencyService.ensureDefaults(admin.id);
  });

  const startDiscussion = (scenario = 'The client moved the deadline up two weeks.') =>
    reviewService.createSession(mentor.id, { clanId: clan.id, kind: 'discussion', scenario });

  // ── the rubric ───────────────────────────────────────────────────────────

  describe('the rubric', () => {
    it('gives a workspace something to score with on day one', () => {
      // A workspace that must invent five competencies before it can score
      // anybody will score nobody.
      expect(rubric.length).toBeGreaterThanOrEqual(4);
      expect(rubric.map((c) => c.name)).toContain('Reasoning');
    });

    it('does not seed twice', async () => {
      const again = await competencyService.ensureDefaults(admin.id);
      expect(again.length).toBe(rubric.length);
      expect(await models.Competency.count()).toBe(rubric.length);
    });

    /**
     * The cap is the feature. Asked to score a dozen qualities for fifteen
     * people during a live call, a mentor clicks the same number down the
     * column and the result is noise that looks like data.
     */
    it('refuses a rubric too long to fill in honestly', async () => {
      await competencyService.create({ name: 'Initiative' }, admin.id); // 6th
      await expect(competencyService.create({ name: 'Curiosity' }, admin.id))
        .rejects.toThrow(/retire one first/i);
    });

    it('refuses the same competency twice, whatever the casing', async () => {
      await expect(competencyService.create({ name: 'reasoning' }, admin.id))
        .rejects.toThrow(/already on the rubric/i);
    });

    it('retires rather than deletes, so old scores keep their meaning', async () => {
      const session = await startDiscussion();
      await reviewService.scoreEntry(mentor.id, session.id, alice.id, [
        { competencyId: rubric[0].id, score: 3 },
      ]);

      await competencyService.retire(rubric[0].id);

      expect(await models.Competency.findByPk(rubric[0].id)).not.toBeNull();
      expect(await models.CompetencyScore.count({ where: { competencyId: rubric[0].id } })).toBe(1);
      const active = await competencyService.list();
      expect(active.map((c) => c.id)).not.toContain(rubric[0].id);
    });
  });

  // ── a discussion is its own session ──────────────────────────────────────

  describe('starting one', () => {
    it('carries the scenario and the kind', async () => {
      const session = await startDiscussion('Two services disagree about who owns the data.');
      expect(session.kind).toBe('discussion');
      expect(session.scenario).toMatch(/who owns the data/);
    });

    it('seats everybody in the clan', async () => {
      const session = await startDiscussion();
      expect(session.entries.map((e) => e.menteeId).sort()).toEqual([alice.id, bob.id].sort());
    });

    /**
     * The one that would quietly ruin an afternoon: two discussions on one day
     * are two events, and collapsing them into one would merge their scores.
     */
    it('does not fold a second discussion into the first', async () => {
      const first = await startDiscussion('Scenario one');
      const second = await startDiscussion('Scenario two');
      expect(second.id).not.toBe(first.id);
      expect(second.scenario).toBe('Scenario two');
    });

    /** But today's review is still one per clan per day. */
    it('still reuses today, for an ordinary review', async () => {
      const a = await reviewService.createSession(mentor.id, { clanId: clan.id });
      const b = await reviewService.createSession(mentor.id, { clanId: clan.id });
      expect(b.id).toBe(a.id);
      expect(a.kind).toBe('review');
    });

    it('refuses a kind that is not one of the three', async () => {
      await expect(reviewService.createSession(mentor.id, { clanId: clan.id, kind: 'workshop' }))
        .rejects.toThrow(/kind must be one of/i);
    });
  });

  // ── scoring, while it happens ────────────────────────────────────────────

  describe('scoring', () => {
    it('records a score against the person and the session', async () => {
      const session = await startDiscussion();
      const saved = await reviewService.scoreEntry(mentor.id, session.id, alice.id, [
        { competencyId: rubric[0].id, score: 4, note: 'Took the opposite side and held it' },
        { competencyId: rubric[1].id, score: 2 },
      ]);
      expect(saved).toHaveLength(2);

      const rows = await models.CompetencyScore.findAll({ where: { menteeId: alice.id } });
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.sourceType === 'review_entry')).toBe(true);
      expect(rows.every((r) => r.scoredBy === mentor.id)).toBe(true);
    });

    /** Scoring somebody IS reviewing them; a second tick is a second action. */
    it('marks them reviewed without a separate step', async () => {
      const session = await startDiscussion();
      await reviewService.scoreEntry(mentor.id, session.id, alice.id, [
        { competencyId: rubric[0].id, score: 3 },
      ]);
      const entry = await models.CohortReviewEntry.findOne({
        where: { sessionId: session.id, menteeId: alice.id },
      });
      expect(entry.status).toBe('reviewed');
    });

    it('treats a second score in the same session as a correction', async () => {
      const session = await startDiscussion();
      await reviewService.scoreEntry(mentor.id, session.id, alice.id, [{ competencyId: rubric[0].id, score: 2 }]);
      await reviewService.scoreEntry(mentor.id, session.id, alice.id, [{ competencyId: rubric[0].id, score: 3 }]);

      const rows = await models.CompetencyScore.findAll({
        where: { menteeId: alice.id, competencyId: rubric[0].id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].score).toBe(3);
    });

    /** Two discussions are two judgements, and both must survive. */
    it('keeps the score from a different session', async () => {
      const first = await startDiscussion('One');
      const second = await startDiscussion('Two');
      await reviewService.scoreEntry(mentor.id, first.id, alice.id, [{ competencyId: rubric[0].id, score: 2 }]);
      await reviewService.scoreEntry(mentor.id, second.id, alice.id, [{ competencyId: rubric[0].id, score: 4 }]);

      const rows = await models.CompetencyScore.findAll({
        where: { menteeId: alice.id, competencyId: rubric[0].id },
      });
      expect(rows).toHaveLength(2);
    });

    it('refuses a score off the scale', async () => {
      const session = await startDiscussion();
      await expect(reviewService.scoreEntry(mentor.id, session.id, alice.id, [
        { competencyId: rubric[0].id, score: 5 },
      ])).rejects.toThrow(/whole number from 1 to 4/i);
    });

    it('refuses a competency that is not on this rubric', async () => {
      const session = await startDiscussion();
      await expect(reviewService.scoreEntry(mentor.id, session.id, alice.id, [
        { competencyId: '00000000-0000-0000-0000-000000000000', score: 3 },
      ])).rejects.toThrow(/not on this rubric/i);
    });

    /** The rubric belongs to a discussion. A daily review is not one. */
    it('refuses to score an ordinary review', async () => {
      const review = await reviewService.createSession(mentor.id, { clanId: clan.id });
      await expect(reviewService.scoreEntry(mentor.id, review.id, alice.id, [
        { competencyId: rubric[0].id, score: 3 },
      ])).rejects.toThrow(/discussion or a presentation/i);
    });

    it('refuses a mentor who does not run the clan', async () => {
      const stranger = await createMentor({ email: `gd-stranger-${Date.now()}@test.com` });
      const session = await startDiscussion();
      await expect(reviewService.scoreEntry(stranger.id, session.id, alice.id, [
        { competencyId: rubric[0].id, score: 3 },
      ])).rejects.toThrow();
    });

    /**
     * Reopening a half-scored room must show what is already done, or the
     * facilitator starts again and scores the loud ones twice.
     */
    it('hands the scores back with the session', async () => {
      const session = await startDiscussion();
      await reviewService.scoreEntry(mentor.id, session.id, alice.id, [
        { competencyId: rubric[0].id, score: 4 },
      ]);
      const reopened = await reviewService.getSession(mentor.id, session.id);
      const hers = reopened.entries.find((e) => e.menteeId === alice.id);
      const his = reopened.entries.find((e) => e.menteeId === bob.id);
      expect(hers.competencyScores).toHaveLength(1);
      expect(hers.competencyScores[0].score).toBe(4);
      expect(his.competencyScores).toHaveLength(0);
    });
  });

  // ── a presentation has a running order ───────────────────────────────────

  describe('a presentation', () => {
    const startPresentation = () =>
      reviewService.createSession(mentor.id, { clanId: clan.id, kind: 'presentation', scenario: 'Show your project' });

    it('keeps who speaks when, in the order given', async () => {
      const session = await startPresentation();
      const after = await reviewService.setSpeakingOrder(mentor.id, session.id, [bob.id, alice.id]);
      expect(after.entries.map((e) => e.menteeId)).toEqual([bob.id, alice.id]);
      expect(after.entries.map((e) => e.speakingOrder)).toEqual([1, 2]);
    });

    /** Somebody dropped from the order has no turn, not a stale one. */
    it('clears a turn taken away', async () => {
      const session = await startPresentation();
      await reviewService.setSpeakingOrder(mentor.id, session.id, [bob.id, alice.id]);
      const after = await reviewService.setSpeakingOrder(mentor.id, session.id, [bob.id]);
      const hers = after.entries.find((e) => e.menteeId === alice.id);
      expect(hers.speakingOrder).toBeNull();
    });

    it('means nothing for a discussion, and says so', async () => {
      const session = await startDiscussion();
      await expect(reviewService.setSpeakingOrder(mentor.id, session.id, [alice.id]))
        .rejects.toThrow(/only means something for a presentation/i);
    });
  });

  // ── where somebody stands ────────────────────────────────────────────────

  describe('standing', () => {
    /**
     * The latest score, not the mean of every score ever given. A mentee who
     * has visibly improved should not be dragged back toward the version of
     * them that existed in month one.
     */
    it('answers with where they are now, and which way they are moving', async () => {
      const first = await startDiscussion('One');
      const second = await startDiscussion('Two');
      await reviewService.scoreEntry(mentor.id, first.id, alice.id, [{ competencyId: rubric[0].id, score: 2 }]);
      await reviewService.scoreEntry(mentor.id, second.id, alice.id, [{ competencyId: rubric[0].id, score: 4 }]);

      const standing = await competencyService.standingFor([alice.id, bob.id]);
      const hers = standing.get(alice.id).find((s) => s.competencyId === rubric[0].id);
      expect(hers.score).toBe(4);
      expect(hers.first).toBe(2);
      expect(hers.trend).toBe('up');
      expect(standing.get(bob.id)).toEqual([]);
    });

    it('calls a single score new rather than flat', async () => {
      const session = await startDiscussion();
      await reviewService.scoreEntry(mentor.id, session.id, alice.id, [{ competencyId: rubric[0].id, score: 3 }]);
      const standing = await competencyService.standingFor([alice.id]);
      expect(standing.get(alice.id)[0].trend).toBe('new');
    });
  });
});
