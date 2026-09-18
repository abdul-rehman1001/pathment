'use strict';

/**
 * The inbox belongs to the portal it was opened from.
 *
 * A person who leads one clan and learns in another saw one merged list in both
 * portals — their mentees' threads sitting next to their own mentor's. The list
 * is paged, so the split has to happen in the query, not over the returned page.
 *
 * The rule is stated as an EXCLUSION: hide the contacts who belong only to the
 * other hat. An inclusion list would silently drop everyone the relationship
 * model can't classify (an admin, someone from a clan you left), and an inbox
 * that quietly loses threads is worse than one showing a few extra.
 */

const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const messagingService = require('../../src/services/messagingService');
const { cleanDb, createMentor, createMentee, createAdmin, createProgram } = require('../helpers/seed');

const titlesFor = async (user, portalRole) => {
  const conversations = await messagingService.listConversations(user.id, {
    portal: { role: portalRole, clanId: null }
  });
  return conversations.flatMap((c) => c.participants.map((p) => p.email)).sort();
};

describe('a dual-role inbox', () => {
  let dual, myMentee, myMentor, anAdmin, program, ledClan, learningClan;

  beforeEach(async () => {
    await cleanDb();

    dual = await createMentor({ email: 'dual@test.com' });
    myMentee = await createMentee({ email: 'my-mentee@test.com' });
    myMentor = await createMentor({ email: 'my-mentor@test.com' });
    anAdmin = await createAdmin({ email: 'an-admin@test.com' });

    program = await createProgram({ createdBy: myMentor.id });
    ledClan = await models.Clan.create({
      programId: program.id, name: 'Viral Loop', leadMentorId: dual.id, createdBy: dual.id
    });
    learningClan = await models.Clan.create({
      programId: program.id, name: 'Community', leadMentorId: myMentor.id, createdBy: myMentor.id
    });

    await clanService.addMember(ledClan.id, { userId: dual.id, role: 'lead_mentor' });
    await clanService.addMember(ledClan.id, { userId: myMentee.id, role: 'mentee' });
    await clanService.addMember(learningClan.id, { userId: myMentor.id, role: 'lead_mentor' });
    await clanService.addMember(learningClan.id, { userId: dual.id, role: 'mentee' });

    for (const other of [myMentee, myMentor, anAdmin]) {
      const conversation = await messagingService.createOrGetDirectConversation(dual.id, other.id);
      await messagingService.sendMessage(dual.id, { conversationId: conversation.id, messageText: 'hello' });
    }
  });

  it('keeps the mentor hat out of the mentee inbox', async () => {
    const emails = await titlesFor(dual, 'mentee');
    expect(emails).not.toContain('my-mentee@test.com');
    expect(emails).toContain('my-mentor@test.com');
  });

  it('keeps the mentee hat out of the mentor inbox', async () => {
    const emails = await titlesFor(dual, 'mentor');
    expect(emails).toContain('my-mentee@test.com');
    expect(emails).not.toContain('my-mentor@test.com');
  });

  it('never hides a contact it cannot classify', async () => {
    expect(await titlesFor(dual, 'mentee')).toContain('an-admin@test.com');
    expect(await titlesFor(dual, 'mentor')).toContain('an-admin@test.com');
  });

  it('shows everything when no portal is stated (older clients)', async () => {
    const conversations = await messagingService.listConversations(dual.id, {});
    const emails = conversations.flatMap((c) => c.participants.map((p) => p.email)).sort();
    expect(emails).toEqual(['an-admin@test.com', 'my-mentee@test.com', 'my-mentor@test.com']);
  });

  it('leaves a single-role person untouched in their own portal', async () => {
    const emails = await titlesFor(myMentee, 'mentee');
    expect(emails).toEqual(['dual@test.com']);
  });

  /**
   * The overlap case, and the reason the rule subtracts rather than selects: in
   * a clan where you co-mentor AND learn, a clan-mate is genuinely both. Their
   * thread belongs in both portals.
   */
  it('keeps a contact who is under both hats in both portals', async () => {
    await clanService.addMember(learningClan.id, { userId: dual.id, role: 'co_mentor' });
    expect(await titlesFor(dual, 'mentee')).toContain('my-mentor@test.com');
    expect(await titlesFor(dual, 'mentor')).toContain('my-mentor@test.com');
  });
});
