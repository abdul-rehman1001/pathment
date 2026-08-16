'use strict';

/**
 * The "Add member" picker must never make a person simply VANISH.
 *
 * The bug: `listAvailableMembers` (role = Mentee) dropped anyone already placed
 * as a mentee in another clan, and dropped platform admins. Both rules are
 * correct — one mentee placement per person; an admin isn't someone's mentee —
 * but silently omitting them made the search look broken: you'd type someone's
 * exact email, get nothing, and have no idea why. The co-mentor picker
 * (listCandidates) has no such filter, so the SAME person appeared the moment
 * you switched the role dropdown, which is what made it look like a search bug
 * rather than a rule.
 *
 * Now an admin (who can reassign) sees them annotated with where they are, so
 * the picker can offer to MOVE them. A mentor still doesn't — taking someone out
 * of another mentor's clan is a transfer request the other side accepts.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const { cleanDb, createMentor, createMentee, createAdmin, createProgram } = require('../helpers/seed');

const find = (people, email) => people.find((p) => p.email === email);

describe('clan add-member picker (mentee role)', () => {
  let lead, program, clanA, clanB, placedMentee, freeMentee;

  beforeEach(async () => {
    await cleanDb();
    lead = await createMentor({ email: 'lead@test.com' });
    program = await createProgram({ createdBy: lead.id });
    clanA = await models.Clan.create({ programId: program.id, name: 'Core Team 2026', leadMentorId: lead.id, createdBy: lead.id });
    clanB = await models.Clan.create({ programId: program.id, name: 'Grumpy Node Clan 2026', leadMentorId: lead.id, createdBy: lead.id });
    await clanService.addMember(clanA.id, { userId: lead.id, role: 'lead_mentor' });

    placedMentee = await createMentee({ email: 'midhat@test.com', firstName: 'Midhat', lastName: 'Kazmi' });
    await clanService.addMember(clanB.id, { userId: placedMentee.id, role: 'mentee' });
    freeMentee = await createMentee({ email: 'free@test.com', firstName: 'Free', lastName: 'Agent' });
  });

  // ── what the admin sees ───────────────────────────────────────────────────
  it('finds someone already in another clan, and says where they are', async () => {
    const people = await clanService.listAvailableMembers({ q: 'midhat@test.com', clanId: clanA.id, includePlaced: true });
    const row = find(people, 'midhat@test.com');

    expect(row).toBeDefined();                       // used to be silently dropped
    expect(row.placedClanId).toBe(clanB.id);
    expect(row.placedClanName).toBe('Grumpy Node Clan 2026');
  });

  it('finds an unplaced person with no placement annotation', async () => {
    const people = await clanService.listAvailableMembers({ q: 'free@test.com', clanId: clanA.id, includePlaced: true });
    const row = find(people, 'free@test.com');
    expect(row).toBeDefined();
    expect(row.placedClanId).toBeNull();
    expect(row.blockedReason).toBeNull();
  });

  it('shows a platform admin with a reason instead of hiding them', async () => {
    await createAdmin({ email: 'boss@test.com' });
    const people = await clanService.listAvailableMembers({ q: 'boss@test.com', clanId: clanA.id, includePlaced: true });
    const row = find(people, 'boss@test.com');
    expect(row).toBeDefined();
    expect(row.blockedReason).toBe('admin');
  });

  it('omits someone already a mentee of THIS clan — nothing to offer', async () => {
    await clanService.addMember(clanA.id, { userId: freeMentee.id, role: 'mentee' });
    const people = await clanService.listAvailableMembers({ q: 'free@test.com', clanId: clanA.id, includePlaced: true });
    expect(find(people, 'free@test.com')).toBeUndefined();
  });

  it('matches on email as well as name', async () => {
    const byName = await clanService.listAvailableMembers({ q: 'Midhat', clanId: clanA.id, includePlaced: true });
    const byEmail = await clanService.listAvailableMembers({ q: 'midhat@test.com', clanId: clanA.id, includePlaced: true });
    expect(find(byName, 'midhat@test.com')).toBeDefined();
    expect(find(byEmail, 'midhat@test.com')).toBeDefined();
  });

  // ── what a mentor sees (unchanged) ────────────────────────────────────────
  it('hides placed people from a caller who cannot reassign', async () => {
    const people = await clanService.listAvailableMembers({ q: 'midhat@test.com', clanId: clanA.id });
    expect(find(people, 'midhat@test.com')).toBeUndefined();
    // …but an unplaced person is still offered, exactly as before.
    const free = await clanService.listAvailableMembers({ q: 'free@test.com', clanId: clanA.id });
    expect(find(free, 'free@test.com')).toBeDefined();
  });

  it('hides platform admins from a caller who cannot reassign', async () => {
    await createAdmin({ email: 'boss@test.com' });
    const people = await clanService.listAvailableMembers({ q: 'boss@test.com', clanId: clanA.id });
    expect(find(people, 'boss@test.com')).toBeUndefined();
  });

  // ── the rule the picker exists to respect ─────────────────────────────────
  it('still refuses a straight add for someone placed elsewhere', async () => {
    await expect(clanService.addMember(clanA.id, { userId: placedMentee.id, role: 'mentee' }))
      .rejects.toThrow(/already a mentee of/i);
  });

  it('moves them cleanly via reassignMentee — the picker’s "Move here"', async () => {
    await clanService.reassignMentee(placedMentee.id, clanA.id, lead.id);

    const now = await models.ClanMembership.findOne({
      where: { userId: placedMentee.id, role: 'mentee', status: 'active' },
    });
    expect(now.clanId).toBe(clanA.id);
    const old = await models.ClanMembership.findOne({
      where: { userId: placedMentee.id, clanId: clanB.id, role: 'mentee' },
    });
    expect(old.status).toBe('removed');
  });
});
