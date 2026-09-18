'use strict';

/**
 * GET /api/clans/mentor/programs/:programId
 *
 * Replaces the page's old 1 + N fetch (the program list, then GET /clans/:id per
 * clan). Because it returns rosters, the scoping matters: a mentor must see only
 * the clans they actually mentor, and nothing from a program they do not.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const {
  cleanDb, createMentor, createMentee, createProgram, authHeader,
} = require('../helpers/seed');

describe('mentor program detail', () => {
  let lead, outsider, mentee, program, clan;

  beforeEach(async () => {
    await cleanDb();
    lead = await createMentor({ email: 'lead@test.com' });
    outsider = await createMentor({ email: 'outsider@test.com' });
    mentee = await createMentee({ email: 'mentee@test.com' });

    program = await createProgram({ createdBy: lead.id });
    clan = await models.Clan.create({
      programId: program.id, name: 'Viral Loop', leadMentorId: lead.id, createdBy: lead.id,
    });
    await clanService.addMember(clan.id, { userId: lead.id, role: 'lead_mentor' });
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });
  });

  it('returns the program and its clan rosters in ONE request', async () => {
    const res = await request(app)
      .get(`/api/clans/mentor/programs/${program.id}`)
      .set('Authorization', authHeader(lead));

    expect(res.status).toBe(200);
    expect(res.body.data.program.id).toBe(program.id);
    expect(res.body.data.clans).toHaveLength(1);

    const [row] = res.body.data.clans;
    expect(row.id).toBe(clan.id);
    expect(row.myRole).toBe('lead_mentor');
    expect(row.mentees.map((m) => m.id)).toContain(mentee.id);
    // The lead is a mentor of the clan, not one of its mentees.
    expect(row.coMentors.map((m) => m.id)).toContain(lead.id);
  });

  it('includes a PAUSED mentee in the roster', async () => {
    await models.ClanMembership.update(
      { status: 'paused' }, { where: { userId: mentee.id, clanId: clan.id } }
    );

    const res = await request(app)
      .get(`/api/clans/mentor/programs/${program.id}`)
      .set('Authorization', authHeader(lead));

    expect(res.status).toBe(200);
    expect(res.body.data.clans[0].mentees.map((m) => m.id)).toContain(mentee.id);
  });

  it('404s for a mentor who mentors no clan in that program', async () => {
    const res = await request(app)
      .get(`/api/clans/mentor/programs/${program.id}`)
      .set('Authorization', authHeader(outsider));

    expect(res.status).toBe(404);
  });

  it('shows only the clans the caller mentors, not every clan in the program', async () => {
    const theirs = await models.Clan.create({
      programId: program.id, name: 'Not Mine', leadMentorId: outsider.id, createdBy: outsider.id,
    });
    await clanService.addMember(theirs.id, { userId: outsider.id, role: 'lead_mentor' });

    const res = await request(app)
      .get(`/api/clans/mentor/programs/${program.id}`)
      .set('Authorization', authHeader(lead));

    expect(res.status).toBe(200);
    expect(res.body.data.clans.map((c) => c.id)).toEqual([clan.id]);
  });
});
