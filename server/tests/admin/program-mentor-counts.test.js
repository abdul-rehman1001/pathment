const { sequelize } = require('../../src/db');
const { programMentorCounts } = require('../../src/services/programMentorCounts');
afterAll(() => sequelize.close());
test('counts distinct leads, co-mentors and legacy matches without cross-program or inactive membership inflation', async () => {
  await sequelize.transaction(async transaction => {
    // Connection-local fixtures shadow public tables and vanish at commit.
    await sequelize.query(`
      CREATE TEMP TABLE clans (id text, program_id text, lead_mentor_id text, status text) ON COMMIT DROP;
      CREATE TEMP TABLE clan_memberships (clan_id text, user_id text, role text, status text) ON COMMIT DROP;
      CREATE TEMP TABLE enrollments (id text, program_id text) ON COMMIT DROP;
      CREATE TEMP TABLE mentor_mentee_matches (mentor_id text, enrollment_id text, status text) ON COMMIT DROP;
      INSERT INTO clans VALUES ('c1','p1','lead','active'),('c2','p1','lead','active'),('c3','p2','other','active'),('old','p1','archived-lead','archived');
      INSERT INTO clan_memberships VALUES ('c1','lead','lead_mentor','active'),('c1','co','co_mentor','active'),('c2','co','co_mentor','active'),('c1','paused','co_mentor','paused'),('c1','learner','mentee','active'),('old','old-co','co_mentor','active');
      INSERT INTO enrollments VALUES ('e1','p1'),('e2','p2');
      INSERT INTO mentor_mentee_matches VALUES ('legacy','e1','active'),('lead','e1','active'),('ended','e1','completed'),('other','e2','active');
    `, {transaction});
    const counts = await programMentorCounts(['p1','p2'], transaction);
    expect(counts.get('p1')).toBe(3);
    expect(counts.get('p2')).toBe(1);
    expect(await programMentorCounts([],transaction)).toEqual(new Map());
  });
});
