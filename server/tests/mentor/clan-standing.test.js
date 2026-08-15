'use strict';

/**
 * Where a clan sits among the others on its programme.
 *
 * The rules that matter are about what is NOT returned. A mentor may learn they
 * are third of nine; they may not learn which colleague is ninth, and the
 * mentees in that clan never agreed to be a data point in a staffroom
 * conversation. So the answer carries a position and a count and nothing else.
 *
 * These lock in: only the programme is compared, the shape names nobody, a clan
 * with nobody scored has no position rather than last place, and the count
 * includes clans that have not started so "third of nine" is not quietly
 * "third of the four that had".
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const performanceService = require('../../src/services/performanceService');
const { cleanDb, createMentor, createMentee, createProgram } = require('../helpers/seed');

describe('a clan standing among its programme', () => {
  let lead, program, other, clanA, clanB, clanElsewhere;

  beforeEach(async () => {
    await cleanDb();
    lead = await createMentor({ email: 'lead@test.com' });
    program = await createProgram({ createdBy: lead.id });
    other = await createProgram({ createdBy: lead.id, name: 'A different programme' });

    clanA = await models.Clan.create({
      programId: program.id, name: 'Backend Bears', leadMentorId: lead.id, createdBy: lead.id,
    });
    clanB = await models.Clan.create({
      programId: program.id, name: 'Frontend Falcons', leadMentorId: lead.id, createdBy: lead.id,
    });
    clanElsewhere = await models.Clan.create({
      programId: other.id, name: 'Data Dolphins', leadMentorId: lead.id, createdBy: lead.id,
    });
  });

  it('counts every clan on the programme and none from another', async () => {
    const standing = await performanceService.clanStanding(clanA.id);

    expect(standing.outOf).toBe(2);
    expect(standing).not.toHaveProperty('clans');
  });

  it('names nobody else, whatever else it says', async () => {
    const standing = await performanceService.clanStanding(clanA.id);

    expect(Object.keys(standing).sort()).toEqual(
      ['average', 'band', 'rank', 'ranked', 'outOf'].sort(),
    );

    // Nothing in the payload should be another clan's id or name.
    const serialised = JSON.stringify(standing);
    expect(serialised).not.toContain(clanB.id);
    expect(serialised).not.toContain('Frontend Falcons');
    expect(serialised).not.toContain(clanElsewhere.id);
  });

  it('gives a clan with nobody scored no position rather than last place', async () => {
    const standing = await performanceService.clanStanding(clanA.id);

    expect(standing.rank).toBeNull();
    expect(standing.average).toBeNull();
    expect(standing.ranked).toBe(0);
  });

  it('still counts the clans that have not started, so the total is honest', async () => {
    const mentee = await createMentee({ email: 'learner@test.com' });
    await clanService.addMember(clanA.id, { userId: mentee.id, role: 'mentee' });

    const standing = await performanceService.clanStanding(clanA.id);

    // Two clans on the programme even though at most one of them can be placed.
    expect(standing.outOf).toBe(2);
    expect(standing.ranked).toBeLessThanOrEqual(1);
  });

  it('refuses a clan that does not exist rather than answering about nothing', async () => {
    await expect(
      performanceService.clanStanding('00000000-0000-4000-8000-000000000000'),
    ).rejects.toThrow('Clan not found');
  });
});
