/**
 * seed-group-discussions - something to look at on the discussion feature.
 *
 * Builds three sessions in the demo workspace so the feature can be judged
 * rather than imagined:
 *
 *   1. A finished DISCUSSION, scored.                 (history)
 *   2. A second finished discussion on the same room,  (history, and the only
 *      scored differently.                             way a trend exists)
 *   3. A live PRESENTATION, half scored, with a        (today, open on the page)
 *      running order already set.
 *
 * Two discussions rather than one is the point: competency standing is the
 * LATEST score, and a trend needs a previous one to move from. One session
 * would show "new" for everybody and prove nothing.
 *
 * Idempotent: it owns the (clan, date, kind) slots below and rebuilds them,
 * including the scores hanging off their entries. It touches nothing else.
 *
 *   DATABASE_URL=... node scripts/seed-group-discussions.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Op } = require('sequelize');
const { sequelize, models } = require('../src/db');
const { runWithRequestContext } = require('../src/utils/auditContext');
const { todayInZone } = require('../src/utils/timezone');
const competencyService = require('../src/services/competencyService');

const SLUG = String(process.env.SEED_ORG_SLUG || 'devweekends').toLowerCase();

/**
 * 'YYYY-MM-DD', n days before today IN THE MENTOR'S OWN ZONE.
 *
 * Not the server's: /mentor/review asks for "today" in the mentor's timezone,
 * so a session dated from UTC lands in history the moment the two disagree -
 * seed at 23:10 in Karachi and the live session is yesterday's by midnight.
 */
const dateFor = (zone, n) => {
  const today = todayInZone(zone);
  if (!n) return today;
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/**
 * Each session names its room, its prompt, and what happened in it.
 *
 * `people` is keyed on the mentee's email because that is the one handle that
 * survives a reseed. Anybody in the clan who is not listed is seated by the
 * service's own reconcile and left alone - which is realistic: a twenty person
 * clan does not all turn up to one discussion.
 */
const PLAN = [
  {
    clan: 'MERN Fellows',
    daysBack: 8,
    kind: 'discussion',
    status: 'finished',
    title: 'Group discussion: the deadline moved',
    scenario:
      'The client has pulled the launch forward by two weeks and the payments API is not ready. '
      + 'You have three days to decide. What do you ship, what do you cut, and who do you tell first?',
    people: [
      // email suffix,          talk,  attendance, scores by competency name
      ['mentee.priya',           412, 'present', { Reasoning: 4, Communication: 4, Ownership: 3, Judgement: 4 }],
      ['mentee.rahul',           338, 'present', { Reasoning: 3, Communication: 2, Ownership: 3, Judgement: 3 }],
      ['mentee.sara',            296, 'present', { Reasoning: 3, Communication: 4, Ownership: 4, Adaptability: 3 }],
      ['mentee.hassan',          181, 'present', { Reasoning: 2, Communication: 2, Ownership: 2, Judgement: 2 }],
      ['mentee.mei',             154, 'present', { Reasoning: 4, Communication: 3, Ownership: 3, Adaptability: 4 }],
      ['mentee.diego',            97, 'present', { Reasoning: 2, Communication: 3, Ownership: 2, Judgement: 3 }],
      ['mentee.noor',             64, 'present', { Reasoning: 3, Communication: 2, Ownership: 3, Adaptability: 2 }],
      ['mentee.leo',               0, 'present', { Reasoning: 2, Communication: 1, Ownership: 2, Judgement: 2 }],
      ['mentee.aya',               0, 'excused', null],
      ['mentee.tom',               0, 'excused', null],
    ],
  },
  {
    clan: 'MERN Fellows',
    daysBack: 3,
    kind: 'discussion',
    status: 'finished',
    title: 'Group discussion: the bug nobody owns',
    scenario:
      'A production bug has been open for nine days. Three people have touched it and none of them '
      + 'think it is theirs. You are in the room with all three. What do you actually say?',
    people: [
      // Deliberately moved: some up, some down, some flat, so standing has
      // something to report other than "first time".
      ['mentee.priya',           274, 'present', { Reasoning: 4, Communication: 4, Ownership: 4, Judgement: 4 }],
      ['mentee.rahul',           402, 'present', { Reasoning: 4, Communication: 3, Ownership: 4, Judgement: 3 }],
      ['mentee.sara',            233, 'present', { Reasoning: 3, Communication: 4, Ownership: 4, Adaptability: 3 }],
      ['mentee.hassan',          310, 'present', { Reasoning: 3, Communication: 3, Ownership: 3, Judgement: 2 }],
      ['mentee.mei',              88, 'present', { Reasoning: 3, Communication: 3, Ownership: 2, Adaptability: 3 }],
      ['mentee.diego',           166, 'present', { Reasoning: 3, Communication: 3, Ownership: 3, Judgement: 3 }],
      ['mentee.noor',             41, 'present', { Reasoning: 2, Communication: 2, Ownership: 2, Adaptability: 2 }],
      ['mentee.leo',             129, 'present', { Reasoning: 3, Communication: 2, Ownership: 3, Judgement: 3 }],
      ['mentee.zoe',              58, 'present', { Reasoning: 2, Communication: 3, Ownership: 2, Judgement: 2 }],
      ['mentee.ivan',              0, 'absent',  null],
    ],
  },
  {
    clan: 'Node Guild',
    daysBack: 0,
    kind: 'presentation',
    status: 'in_progress',
    title: 'Demo day: week six builds',
    scenario:
      'Five minutes each. What you built, one decision you would make differently now, and the '
      + 'hardest bug you fixed. Two minutes of questions after each one.',
    people: [
      // Half scored on purpose: the panel counts "N of M scored", and a
      // half-finished room is what it actually looks like mid-session.
      ['mentee.grace',           301, 'present', { Reasoning: 4, Communication: 4, Ownership: 4, Judgement: 3 }, 1],
      ['mentee.ahmed',           288, 'present', { Reasoning: 3, Communication: 3, Ownership: 3, Adaptability: 3 }, 2],
      ['mentee.yara',            264, 'present', { Reasoning: 3, Communication: 4, Ownership: 2, Judgement: 3 }, 3],
      ['mentee.pedro',           117, 'present', null, 4],
      ['mentee.nina',              0, 'present', null, 5],
      ['mentee.felix',             0, 'present', null, 6],
      ['mentee.maya',              0, 'absent',  null, null],
    ],
  },
];

async function seed() {
  const org = await models.Organization.findOne({ where: { slug: SLUG }, skipOrganizationScope: true });
  if (!org) throw new Error(`Organization "${SLUG}" not found`);

  await runWithRequestContext({ organizationId: org.id, organizationSlug: org.slug, workspaceJob: true }, async () => {
    // The rubric has to exist before anything can be scored against it. This
    // is the same call the first GET /competencies makes, so running it here
    // changes nothing about how a real workspace starts.
    const competencies = await competencyService.ensureDefaults();
    const byName = new Map(competencies.map((c) => [c.name, c.id]));
    console.log(`Rubric: ${competencies.map((c) => c.name).join(', ')}`);

    for (const spec of PLAN) {
      const clan = await models.Clan.findOne({ where: { name: spec.clan } });
      if (!clan) { console.warn(`! clan "${spec.clan}" not found, skipped`); continue; }

      const lead = await models.ClanMembership.findOne({
        where: { clanId: clan.id, role: 'lead_mentor' },
        order: [['created_at', 'ASC']],
      });
      if (!lead) { console.warn(`! "${spec.clan}" has no lead mentor, skipped`); continue; }

      const settings = await models.UserSettings.findOne({
        where: { userId: lead.userId }, attributes: ['timezone'],
      });
      const date = dateFor(settings?.timezone || 'UTC', spec.daysBack);

      // Own the slot: rebuild rather than pile a second copy on top. The scores
      // go first because they point at the entries.
      const stale = await models.CohortReviewSession.findAll({
        where: { clanId: clan.id, sessionDate: date, kind: spec.kind },
        attributes: ['id'],
      });
      if (stale.length) {
        const staleEntries = await models.CohortReviewEntry.findAll({
          where: { sessionId: { [Op.in]: stale.map((s) => s.id) } }, attributes: ['id'],
        });
        if (staleEntries.length) {
          await models.CompetencyScore.destroy({
            where: { sourceType: 'review_entry', sourceId: { [Op.in]: staleEntries.map((e) => e.id) } },
          });
        }
        await models.CohortReviewEntry.destroy({ where: { sessionId: { [Op.in]: stale.map((s) => s.id) } } });
        await models.CohortReviewSession.destroy({ where: { id: { [Op.in]: stale.map((s) => s.id) } } });
      }

      const session = await models.CohortReviewSession.create({
        mentorId: lead.userId,
        clanId: clan.id,
        sessionDate: date,
        kind: spec.kind,
        title: spec.title,
        scenario: spec.scenario,
        status: spec.status,
        finishedAt: spec.status === 'finished' ? new Date(`${date}T17:30:00Z`) : null,
        attendanceTracking: true,
      });

      // Seat the whole clan, the same way the service does when the page opens.
      // Everyone gets an entry; the plan then says what happened to the ones
      // who were actually in the room.
      const members = await models.ClanMembership.findAll({
        where: { clanId: clan.id, role: 'mentee', status: 'active' },
        include: [{ model: models.User, as: 'user', attributes: ['id', 'email', 'firstName'] }],
      });
      const byEmailPrefix = new Map(members.map((m) => [String(m.user?.email || '').split('@')[0], m.user]));

      const named = new Set();
      const rows = [];
      for (const [prefix, talk, attendance, scores, order] of spec.people) {
        const user = byEmailPrefix.get(prefix);
        if (!user) { console.warn(`  ! ${prefix} is not in ${spec.clan}, skipped`); continue; }
        named.add(user.id);
        rows.push({
          sessionId: session.id,
          menteeId: user.id,
          attendance,
          status: scores ? 'reviewed' : 'pending',
          talkSeconds: talk,
          secondsPresent: attendance === 'present' ? 3600 : 0,
          speakingOrder: order ?? null,
          autoPresent: attendance === 'present',
          scores,
        });
      }
      // Anybody in the clan who was not in the room: present as an entry so
      // the counts add up, marked absent so the panel dims them.
      for (const member of members) {
        if (!member.user || named.has(member.user.id)) continue;
        rows.push({
          sessionId: session.id, menteeId: member.user.id, attendance: 'absent',
          status: 'pending', talkSeconds: 0, secondsPresent: 0, speakingOrder: null,
          autoPresent: false, scores: null,
        });
      }

      const created = await models.CohortReviewEntry.bulkCreate(
        rows.map(({ scores, ...row }) => row), // eslint-disable-line no-unused-vars
        { returning: true },
      );
      const entryByMentee = new Map(created.map((e) => [e.menteeId, e]));

      let scored = 0;
      for (const row of rows) {
        if (!row.scores) continue;
        const entry = entryByMentee.get(row.menteeId);
        if (!entry) continue;
        const items = Object.entries(row.scores).map(([name, score]) => {
          const competencyId = byName.get(name);
          if (!competencyId) throw new Error(`"${name}" is not on the rubric`);
          return { competencyId, score };
        });
        // Through the service, not straight into the table: the same
        // findOrCreate-then-correct path a live tap takes.
        await competencyService.score({
          menteeId: row.menteeId,
          sourceType: 'review_entry',
          sourceId: entry.id,
          scores: items,
          scoredBy: lead.userId,
        });
        scored += 1;
      }

      console.log(
        `✓ ${spec.kind} · ${spec.clan} · ${date} · ${spec.status}`
        + ` — ${created.length} seated, ${scored} scored`,
      );
    }
  });
}

seed()
  .then(() => console.log('Done.'))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => sequelize.close());
