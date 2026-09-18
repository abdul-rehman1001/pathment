'use strict';

/**
 * One person, several hats.
 *
 * Somebody can lead one clan, co-mentor a second, and be a LEARNER in a third
 * at the same time. Every "my stuff" read used to answer with the union of all
 * of that, because the server had no idea which portal the browser had open —
 * so their own Roadblocks page listed their mentees' roadblocks and their
 * mentee inbox listed the threads they hold as a mentor.
 *
 * The portal now travels with the request (middlewares/portalScope.js). These
 * lock in what each hat is allowed to see, and — just as importantly — that a
 * request carrying no portal behaves exactly as it did before.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const authzService = require('../../src/services/authzService');
const frictionService = require('../../src/services/frictionService');
const { cleanDb, createMentor, createMentee, createProgram } = require('../helpers/seed');

const MENTEE_PORTAL = { role: 'mentee', clanId: null };
const NO_PORTAL = { role: null, clanId: null };

describe('portal scoping for a person who both mentors and learns', () => {
  let dual, otherLead, theirMentee, myClanMate, program, ledClan, learningClan;

  beforeEach(async () => {
    await cleanDb();

    // `dual` leads "Viral Loop" and is a mentee in "Community", where
    // `otherLead` runs the clan and `myClanMate` learns alongside them.
    dual = await createMentor({ email: 'dual@test.com' });
    otherLead = await createMentor({ email: 'other-lead@test.com' });
    theirMentee = await createMentee({ email: 'their-mentee@test.com' });
    myClanMate = await createMentee({ email: 'clan-mate@test.com' });

    program = await createProgram({ createdBy: otherLead.id });

    ledClan = await models.Clan.create({
      programId: program.id, name: 'Viral Loop', leadMentorId: dual.id, createdBy: dual.id
    });
    learningClan = await models.Clan.create({
      programId: program.id, name: 'Community', leadMentorId: otherLead.id, createdBy: otherLead.id
    });

    await clanService.addMember(ledClan.id, { userId: dual.id, role: 'lead_mentor' });
    await clanService.addMember(ledClan.id, { userId: theirMentee.id, role: 'mentee' });

    await clanService.addMember(learningClan.id, { userId: otherLead.id, role: 'lead_mentor' });
    await clanService.addMember(learningClan.id, { userId: dual.id, role: 'mentee' });
    await clanService.addMember(learningClan.id, { userId: myClanMate.id, role: 'mentee' });
  });

  describe('menteeIdsForPortal', () => {
    it('narrows the mentee portal to the person themselves', async () => {
      const ids = await authzService.menteeIdsForPortal(dual, MENTEE_PORTAL);
      expect(ids).toEqual([dual.id]);
    });

    it('gives the mentor portal their mentees, and never themselves', async () => {
      const ids = await authzService.menteeIdsForPortal(dual, { role: 'mentor', clanId: null });
      expect(ids).toContain(theirMentee.id);
      expect(ids).not.toContain(dual.id);
    });

    it('honours the clan selector: another clan yields none of this one', async () => {
      const ids = await authzService.menteeIdsForPortal(dual, { role: 'mentor', clanId: learningClan.id });
      expect(ids).not.toContain(theirMentee.id);
    });

    it('does not narrow when no portal is stated', async () => {
      expect(await authzService.menteeIdsForPortal(dual, NO_PORTAL)).toBeNull();
    });

    it('gives a mentee portal nothing to somebody who is not a learner anywhere', async () => {
      const ids = await authzService.menteeIdsForPortal(otherLead, MENTEE_PORTAL);
      expect(ids).toEqual([]);
    });
  });

  describe('blockers', () => {
    beforeEach(async () => {
      await frictionService.createBlocker(
        { menteeId: dual.id, title: 'my own hospital visits' }, dual.id, dual
      );
      await frictionService.createBlocker(
        { menteeId: theirMentee.id, title: "a mentee's broken quiz" }, dual.id, dual
      );
    });

    it('shows only the caller their own, in the mentee portal', async () => {
      const blockers = await frictionService.listBlockers({ user: dual, portal: MENTEE_PORTAL });
      expect(blockers.map((b) => b.title)).toEqual(['my own hospital visits']);
    });

    it("shows the mentor portal their mentees' and not their own", async () => {
      const blockers = await frictionService.listBlockers({
        user: dual, portal: { role: 'mentor', clanId: null }
      });
      expect(blockers.map((b) => b.title)).toEqual(["a mentee's broken quiz"]);
    });

    it('scopes the mentor portal to the selected clan', async () => {
      const blockers = await frictionService.listBlockers({
        user: dual, portal: { role: 'mentor', clanId: learningClan.id }
      });
      expect(blockers).toEqual([]);
    });

    it('still returns the union when no portal is stated (older clients)', async () => {
      const blockers = await frictionService.listBlockers({ user: dual, portal: NO_PORTAL });
      expect(blockers.map((b) => b.title).sort()).toEqual(
        ['a mentee\'s broken quiz', 'my own hospital visits']
      );
    });

    it('an explicit menteeId still wins, and is still authorized', async () => {
      const mine = await frictionService.listBlockers({
        menteeId: dual.id, user: dual, portal: { role: 'mentor', clanId: null }
      });
      expect(mine.map((b) => b.title)).toEqual(['my own hospital visits']);

      await expect(
        frictionService.listBlockers({ menteeId: myClanMate.id, user: dual, portal: MENTEE_PORTAL })
      ).rejects.toThrow(/not authorized/i);
    });
  });
});
