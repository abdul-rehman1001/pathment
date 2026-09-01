/**
 * Demo seeder — a single, self-contained, demo-ready dataset for client demos.
 *
 * Creates one fully-populated program with everything the admin, mentor and
 * mentee experiences need to look real:
 *   • 1 admin, 2 lead mentors + 1 CO-MENTOR (with a permission override), 8 mentees
 *     (all log in with the same demo password)
 *   • 1 published program + running cohort + 2 clans
 *   • 1 org roadmap (6 ordered tasks) + a LOCAL imported copy per lead mentor
 *     (the real import→assign flow), with per-mentee roadmap progress
 *   • per-mentee enrollments + assigned tasks crafted to span the FULL risk
 *     spectrum (on-track, star, disengaged/at-risk, struggling-but-fighting,
 *     on-watch, awaiting-review, brand-new) so the mentor cockpit, at-risk page
 *     and review flow all show legitimate, varied data
 *   • real submissions (+ feedback on completed tasks) so the review flow works
 *   • a co-mentor promotion candidate awaiting admin approval
 *   • blockers, accepted delays, meeting notes, filled schedules, announcements
 *   • cohort-review SESSIONS + attendance (last week finished + today in-progress)
 *     so the weekly-review screen and the round attendance strip show real data
 *   • 1:1 scheduling — open availability slots + booked meetings (upcoming /
 *     completed / cancelled-with-reason) carrying real UTC instants + timezones
 *   • direct-message threads (mentor ↔ mentee), and notifications for every role
 *   • community posts across clan / program / global scopes (incl. a resolved
 *     question with an accepted answer, kudos and a win) + comments + reactions
 *   • anonymous mentor feedback (program_reviews, ≥3 each so the card unlocks)
 *   • daily activity logs (streaks), badges + points history + a leaderboard
 *   • roadmap chaining (Core → Advanced Patterns) and a sample bug report
 *
 * Idempotent: it always wipes and recreates the demo namespace (everything
 * scoped to @demo.pathment.com users + the demo program), so re-running gives
 * a clean, consistent dataset. It never touches real data.
 *
 * Run with:  npm run seed:demo
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const bcrypt = require("bcrypt");
const { sequelize, models } = require("../src/db");
const { Op } = require("sequelize");

const DEMO_DOMAIN = "@demo.pathment.com";
const DEMO_PASSWORD = "Demo@1234";
const PROGRAM_NAME = "MERN Stack Engineering Fellowship (Demo)";

// Date helpers — everything is relative to "now" so the demo always looks fresh.
const DAY = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
const daysAhead = (n) => new Date(Date.now() + n * DAY);

// ── The demo roster ──────────────────────────────────────────────────────────
// 20 mentees in the hero clan (HERO) + 6 in the second clan (SIDE), so a video
// walkthrough shows a full cohort rather than a handful of rows. Archetypes are
// deliberately weighted the way a real cohort skews: mostly fine, a few needing
// attention, one or two genuinely at risk.
const MENTEE_SPECS = [
  // ── Hero clan · MERN Fellows (20) ──────────────────────────────────────────
  { first: "Maya", last: "Patel", local: "mentee.maya", clan: "HERO", archetype: "star", occupation: "Frontend Developer", active: 0 },
  { first: "Leo", last: "Nguyen", local: "mentee.leo", clan: "HERO", archetype: "on_track", occupation: "CS Student", active: 1 },
  { first: "Sara", last: "Ali", local: "mentee.sara", clan: "HERO", archetype: "disengaged", occupation: null, active: 14 },
  { first: "Tom", last: "Becker", local: "mentee.tom", clan: "HERO", archetype: "new", occupation: null, active: null },
  { first: "Priya", last: "Sharma", local: "mentee.priya", clan: "HERO", archetype: "review", occupation: "Bootcamp Grad", active: 1 },
  { first: "Noor", last: "Hassan", local: "mentee.noor", clan: "HERO", archetype: "fighting", occupation: "Junior Backend Engineer", active: 2 },
  { first: "Ivan", last: "Petrov", local: "mentee.ivan", clan: "HERO", archetype: "watch", occupation: "University Student", active: 6 },
  { first: "Jack", last: "Owusu", local: "mentee.jack", clan: "HERO", archetype: "average", occupation: "Self-taught", active: 3 },
  { first: "Lina", last: "Haddad", local: "mentee.lina", clan: "HERO", archetype: "star", occupation: "QA Engineer", active: 0 },
  { first: "Diego", last: "Morales", local: "mentee.diego", clan: "HERO", archetype: "on_track", occupation: "Support Engineer", active: 1 },
  { first: "Aya", last: "Tanaka", local: "mentee.aya", clan: "HERO", archetype: "on_track", occupation: "Data Analyst", active: 2 },
  { first: "Kwame", last: "Mensah", local: "mentee.kwame", clan: "HERO", archetype: "average", occupation: "Career Switcher", active: 4 },
  { first: "Elif", last: "Demir", local: "mentee.elif", clan: "HERO", archetype: "review", occupation: "CS Student", active: 1 },
  { first: "Rahul", last: "Verma", local: "mentee.rahul", clan: "HERO", archetype: "watch", occupation: "Freelancer", active: 7 },
  { first: "Chloe", last: "Dubois", local: "mentee.chloe", clan: "HERO", archetype: "average", occupation: "Bootcamp Grad", active: 3 },
  { first: "Omar", last: "Siddiqui", local: "mentee.omars", clan: "HERO", archetype: "fighting", occupation: "Night-shift Developer", active: 2 },
  { first: "Zoe", last: "Anderson", local: "mentee.zoe", clan: "HERO", archetype: "on_track", occupation: "Junior Developer", active: 1 },
  { first: "Hassan", last: "Iqbal", local: "mentee.hassan", clan: "HERO", archetype: "disengaged", occupation: null, active: 11 },
  { first: "Mei", last: "Lin", local: "mentee.mei", clan: "HERO", archetype: "star", occupation: "Frontend Developer", active: 0 },
  { first: "Daniel", last: "Okafor", local: "mentee.daniel", clan: "HERO", archetype: "new", occupation: "Graduate", active: null },

  // ── Second clan · Node Guild (6), so clan comparison has a peer ────────────
  { first: "Nina", last: "Kovacs", local: "mentee.nina", clan: "SIDE", archetype: "on_track", occupation: "Backend Developer", active: 1 },
  { first: "Ahmed", last: "Belkacem", local: "mentee.ahmed", clan: "SIDE", archetype: "average", occupation: "CS Student", active: 3 },
  { first: "Grace", last: "Mwangi", local: "mentee.grace", clan: "SIDE", archetype: "star", occupation: "Platform Engineer", active: 0 },
  { first: "Pedro", last: "Alves", local: "mentee.pedro", clan: "SIDE", archetype: "watch", occupation: "Self-taught", active: 6 },
  { first: "Yara", last: "Nasser", local: "mentee.yara", clan: "SIDE", archetype: "review", occupation: "Bootcamp Grad", active: 2 },
  { first: "Felix", last: "Braun", local: "mentee.felix", clan: "SIDE", archetype: "fighting", occupation: "Part-time Developer", active: 4 },
];

async function cleanupDemo() {
  console.log("🧹 Clearing any existing demo namespace…");
  // paranoid:false so we also catch SOFT-DELETED demo users from a prior run —
  // otherwise their rows (and unique emails) linger and the re-seed collides.
  const demoUsers = await models.User.findAll({
    where: { email: { [Op.like]: `%${DEMO_DOMAIN}` } },
    attributes: ["id"],
    paranoid: false,
  });
  const userIds = demoUsers.map((u) => u.id);
  // Match on the "(Demo)" suffix rather than one exact name: the program has been
  // renamed before, and keying on the current name silently orphaned the previous
  // run's clans and roadmaps (they survived the wipe and lingered in the UI).
  const demoPrograms = await models.Program.findAll({
    where: { name: { [Op.like]: "%(Demo)" } }, attributes: ["id"], paranoid: false,
  });
  const programIds = demoPrograms.map((p) => p.id);

  // Child rows first (FK order). Scope strictly to demo users / demo program.
  if (userIds.length) {
    // force:true everywhere — several models are paranoid (soft-delete), and a
    // soft delete would leave rows + unique emails behind and break the re-seed.
    const byMentee = { where: { menteeId: { [Op.in]: userIds } }, force: true };

    // Submissions / feedback hang off the demo's assigned tasks — clear them
    // before the tasks (deepest FK children first).
    const demoTasks = await models.AssignedTask.findAll({ where: { menteeId: { [Op.in]: userIds } }, attributes: ["id"], paranoid: false });
    const taskIds = demoTasks.map((t) => t.id);
    if (taskIds.length) {
      if (models.TaskFeedback) await models.TaskFeedback.destroy({ where: { assignedTaskId: { [Op.in]: taskIds } }, force: true });
      const subs = await models.TaskSubmission.findAll({ where: { assignedTaskId: { [Op.in]: taskIds } }, attributes: ["id"], paranoid: false });
      const subIds = subs.map((s) => s.id);
      if (subIds.length && models.TaskSubmissionFile) await models.TaskSubmissionFile.destroy({ where: { submissionId: { [Op.in]: subIds } }, force: true });
      await models.TaskSubmission.destroy({ where: { assignedTaskId: { [Op.in]: taskIds } }, force: true });

      // Assessable work hangs off the same tasks: answers, then the session
      // that holds them, then the assignment that pins the kit to the task.
      // Any other order hits a foreign key.
      for (const [Answer, Session, Assignment, sessionKey] of [
        [models.QuizAnswer, models.QuizSession, models.QuizAssignment, "quizAssignmentId"],
        [models.InterviewAnswer, models.InterviewSession, models.InterviewAssignment, "interviewAssignmentId"],
      ]) {
        if (!Session) continue;
        void sessionKey;
        const sessions = await Session.findAll({ where: { assignedTaskId: { [Op.in]: taskIds } }, attributes: ["id"], paranoid: false });
        const sessionIds = sessions.map((row) => row.id);
        if (sessionIds.length && Answer) await Answer.destroy({ where: { sessionId: { [Op.in]: sessionIds } }, force: true });
        await Session.destroy({ where: { assignedTaskId: { [Op.in]: taskIds } }, force: true });
        if (Assignment) await Assignment.destroy({ where: { assignedTaskId: { [Op.in]: taskIds } }, force: true });
      }
    }

    // The one-off roadmap steps behind those custom tasks. They carry no
    // roadmapId, so the by-program sweep further down cannot see them, and
    // without this every re-run would leave another orphan pair behind.
    const customStepIds = [...new Set(
      (await models.AssignedTask.findAll({
        where: { menteeId: { [Op.in]: userIds }, isCustomTask: true },
        attributes: ["roadmapTaskId"],
        paranoid: false,
      })).map((t) => t.roadmapTaskId).filter(Boolean)
    )];
    if (models.RoadmapProgress) await models.RoadmapProgress.destroy(byMentee);
    if (models.PromotionCandidate) await models.PromotionCandidate.destroy({ where: { [Op.or]: [{ menteeId: { [Op.in]: userIds } }, { nominatedBy: { [Op.in]: userIds } }] }, force: true });
    if (models.ClanMemberPermission) await models.ClanMemberPermission.destroy({ where: { userId: { [Op.in]: userIds } }, force: true });

    // RAG tables reference users directly, so they have to go before the users
    // do — otherwise the re-seed dies on a foreign key. Guarded, because the
    // feature is optional and these models may not be registered at all.
    if (models.MentorEditHistory) await models.MentorEditHistory.destroy({ where: { mentorId: { [Op.in]: userIds } }, force: true });
    if (models.MessageDraft) {
      await models.MessageDraft.destroy({
        where: { [Op.or]: [{ mentorId: { [Op.in]: userIds } }, { menteeId: { [Op.in]: userIds } }] }, force: true,
      });
    }
    if (models.KnowledgeChunk) await models.KnowledgeChunk.destroy({ where: { mentorId: { [Op.in]: userIds } }, force: true });
    if (models.RagIngestionJob) await models.RagIngestionJob.destroy({ where: { mentorId: { [Op.in]: userIds } }, force: true });
    if (models.MentorStyleProfile) await models.MentorStyleProfile.destroy({ where: { mentorId: { [Op.in]: userIds } }, force: true });
    if (models.MentorDocument) await models.MentorDocument.destroy({ where: { mentorId: { [Op.in]: userIds } }, force: true });

    await models.MeetingNote.destroy({ where: { menteeId: { [Op.in]: userIds } }, force: true });
    await models.MenteeSchedule.destroy(byMentee);
    await models.Blocker.destroy(byMentee);
    await models.DelayEvent.destroy(byMentee);
    await models.AssignedTask.destroy(byMentee);
    if (customStepIds.length) {
      await models.RoadmapTask.destroy({ where: { id: { [Op.in]: customStepIds }, roadmapId: null }, force: true });
    }
    await models.Enrollment.destroy(byMentee);
    await models.ClanMembership.destroy({ where: { userId: { [Op.in]: userIds } }, force: true });
    if (models.ClanJoinRequest) {
      await models.ClanJoinRequest.destroy({
        where: { [Op.or]: [{ userId: { [Op.in]: userIds } }, { reviewedBy: { [Op.in]: userIds } }] },
        force: true,
      });
    }
    await models.Announcement.destroy({ where: { authorId: { [Op.in]: userIds } }, force: true });

    // ── Newer feature tables (added after the original seeder) ────────────────
    const userIn = { [Op.in]: userIds };
    // Cohort review sessions + their attendance entries (entries first).
    if (models.CohortReviewSession) {
      const sessions = await models.CohortReviewSession.findAll({ where: { mentorId: userIn }, attributes: ["id"], paranoid: false });
      const sessionIds = sessions.map((s) => s.id);
      if (sessionIds.length && models.CohortReviewEntry) await models.CohortReviewEntry.destroy({ where: { sessionId: { [Op.in]: sessionIds } }, force: true });
      if (models.CohortReviewUnlockRequest) await models.CohortReviewUnlockRequest.destroy({ where: { sessionId: { [Op.in]: sessionIds.length ? sessionIds : ["00000000-0000-0000-0000-000000000000"] } }, force: true });
      await models.CohortReviewSession.destroy({ where: { mentorId: userIn }, force: true });
    }
    // 1:1 scheduling — meetings before the slots they reference.
    if (models.ScheduledMeeting) await models.ScheduledMeeting.destroy({ where: { [Op.or]: [{ mentorId: userIn }, { menteeId: userIn }] }, force: true });
    if (models.AvailabilitySlot) await models.AvailabilitySlot.destroy({ where: { mentorId: userIn }, force: true });
    // Community — reactions + comments before posts.
    if (models.CommunityPost) {
      const posts = await models.CommunityPost.findAll({ where: { authorId: userIn }, attributes: ["id"], paranoid: false });
      const postIds = posts.map((p) => p.id);
      if (postIds.length) {
        if (models.CommunityReaction) await models.CommunityReaction.destroy({ where: { postId: { [Op.in]: postIds } }, force: true });
        if (models.CommunityComment) await models.CommunityComment.destroy({ where: { postId: { [Op.in]: postIds } }, force: true });
      }
      if (models.CommunityReaction) await models.CommunityReaction.destroy({ where: { userId: userIn }, force: true });
      if (models.CommunityComment) await models.CommunityComment.destroy({ where: { authorId: userIn }, force: true });
      await models.CommunityPost.destroy({ where: { authorId: userIn }, force: true });
    }
    // Messaging — messages + participants before conversations.
    if (models.Conversation) {
      const convos = await models.Conversation.findAll({ where: { createdBy: userIn }, attributes: ["id"], paranoid: false });
      const convoIds = convos.map((c) => c.id);
      if (models.Message) await models.Message.destroy({ where: { [Op.or]: [{ senderId: userIn }, { recipientId: userIn }] }, force: true });
      if (convoIds.length && models.ConversationParticipant) await models.ConversationParticipant.destroy({ where: { conversationId: { [Op.in]: convoIds } }, force: true });
      if (models.ConversationParticipant) await models.ConversationParticipant.destroy({ where: { userId: userIn }, force: true });
      await models.Conversation.destroy({ where: { createdBy: userIn }, force: true });
    }
    if (models.Notification) await models.Notification.destroy({ where: { userId: userIn }, force: true });
    if (models.DailyLogEntry) await models.DailyLogEntry.destroy({ where: { menteeId: userIn }, force: true });
    if (models.PointsHistory) await models.PointsHistory.destroy({ where: { userId: userIn }, force: true });
    if (models.UserBadge) await models.UserBadge.destroy({ where: { userId: userIn }, force: true });
    if (models.LeaderboardEntry) await models.LeaderboardEntry.destroy({ where: { userId: userIn }, force: true });
    if (models.ProgramReview) await models.ProgramReview.destroy({ where: { [Op.or]: [{ reviewerId: userIn }, { mentorId: userIn }] }, force: true });
    if (models.FeedbackReport) await models.FeedbackReport.destroy({ where: { reporterId: userIn }, force: true });
    if (models.ProductUpdate) await models.ProductUpdate.destroy({ where: { createdBy: userIn }, force: true });

    // ── Assessable work, the library and the everyday furniture ───────────────
    // Kits last: their questions reference them, and their assignments were
    // already cleared above with the tasks.
    for (const [Kit, Question] of [
      [models.QuizKit, models.QuizQuestion],
      [models.InterviewKit, models.InterviewQuestion],
    ]) {
      if (!Kit) continue;
      const kits = await Kit.findAll({ where: { createdBy: userIn }, attributes: ["id"], paranoid: false });
      const kitIds = kits.map((k) => k.id);
      if (kitIds.length && Question) await Question.destroy({ where: { kitId: { [Op.in]: kitIds } }, force: true });
      await Kit.destroy({ where: { createdBy: userIn }, force: true });
    }

    if (models.Redemption) await models.Redemption.destroy({ where: { menteeId: userIn }, force: true });
    if (models.Gift) await models.Gift.destroy({ where: { createdBy: userIn }, force: true });
    if (models.Track) await models.Track.destroy({ where: { menteeId: userIn }, force: true });
    if (models.RegistrationInvite) await models.RegistrationInvite.destroy({ where: { invitedBy: userIn }, force: true });
    if (models.Document) await models.Document.destroy({ where: { createdBy: userIn }, force: true });
    if (models.UserSettings) await models.UserSettings.destroy({ where: { userId: userIn }, force: true });

    if (models.Challenge) {
      const challenges = await models.Challenge.findAll({ where: { createdBy: userIn }, attributes: ["id"], paranoid: false });
      const challengeIds = challenges.map((c) => c.id);
      if (challengeIds.length && models.UserChallenge) await models.UserChallenge.destroy({ where: { challengeId: { [Op.in]: challengeIds } }, force: true });
      await models.Challenge.destroy({ where: { createdBy: userIn }, force: true });
    }
  }
  if (programIds.length) {
    const inPrograms = { [Op.in]: programIds };
    const roadmaps = await models.Roadmap.findAll({ where: { programId: inPrograms }, attributes: ["id"], paranoid: false });
    const rmIds = roadmaps.map((r) => r.id);
    if (rmIds.length) {
      // RoadmapProgress references roadmaps (the local copies) — clear any strays.
      if (models.RoadmapProgress) await models.RoadmapProgress.destroy({ where: { roadmapId: { [Op.in]: rmIds } }, force: true });
      // Chaining links between demo roadmaps (either direction).
      if (models.RoadmapLink) await models.RoadmapLink.destroy({ where: { [Op.or]: [{ fromRoadmapId: { [Op.in]: rmIds } }, { toRoadmapId: { [Op.in]: rmIds } }] }, force: true });
      await models.RoadmapTask.destroy({ where: { roadmapId: { [Op.in]: rmIds } }, force: true });
    }
    await models.Roadmap.destroy({ where: { programId: inPrograms }, force: true });
    if (models.ClanJoinRequest) {
      const demoClans = await models.Clan.findAll({
        where: { programId: inPrograms },
        attributes: ["id"],
        paranoid: false,
      });
      const clanIds = demoClans.map((c) => c.id);
      if (clanIds.length) {
        await models.ClanJoinRequest.destroy({ where: { clanId: { [Op.in]: clanIds } }, force: true });
      }
    }
    await models.Clan.destroy({ where: { programId: inPrograms }, force: true });
    const cohorts = await models.Cohort.findAll({ where: { programId: inPrograms }, attributes: ["id"], paranoid: false });
    const cohortIds = cohorts.map((c) => c.id);
    if (cohortIds.length) {
      if (models.AssessmentSubmission && models.Application) {
        const apps = await models.Application.findAll({ where: { cohortId: { [Op.in]: cohortIds } }, attributes: ["id"], paranoid: false });
        const appIds = apps.map((a) => a.id);
        if (appIds.length) await models.AssessmentSubmission.destroy({ where: { applicationId: { [Op.in]: appIds } }, force: true });
      }
      if (models.Application) await models.Application.destroy({ where: { cohortId: { [Op.in]: cohortIds } }, force: true });
      if (models.CohortAssessment) await models.CohortAssessment.destroy({ where: { cohortId: { [Op.in]: cohortIds } }, force: true });
    }
    await models.Cohort.destroy({ where: { programId: inPrograms }, force: true });
    await models.Program.destroy({ where: { id: inPrograms }, force: true });
  }
  if (userIds.length) {
    if (models.UserSkill) await models.UserSkill.destroy({ where: { userId: { [Op.in]: userIds } }, force: true });
    await models.MenteeProfile.destroy({ where: { userId: { [Op.in]: userIds } }, force: true });
    await models.MentorProfile.destroy({ where: { userId: { [Op.in]: userIds } }, force: true });
    await models.AdminProfile.destroy({ where: { userId: { [Op.in]: userIds } }, force: true });
    await models.ScheduleTemplate.destroy({ where: { createdBy: { [Op.in]: userIds } }, force: true });
    await models.User.destroy({ where: { id: { [Op.in]: userIds } }, force: true });
  }
  console.log("✅ Demo namespace clear\n");
}

async function makeUser({ first, last, emailLocal, role, occupation, lastActivityDate, level }) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const user = await models.User.create({
    firstName: first,
    lastName: last,
    email: `${emailLocal}${DEMO_DOMAIN}`,
    passwordHash,
    role,
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
    profileCompleted: true,
    onboardingStep: 3,
  });

  if (role === "admin") {
    await models.AdminProfile.create({
      userId: user.id,
      permissions: ["all"],
      canManageUsers: true,
      canCreatePrograms: true,
      canViewAnalytics: true,
    });
  } else if (role === "mentor") {
    await models.MentorProfile.create({
      userId: user.id,
      yearsOfExperience: 7,
      maxMentees: 15,
      isAcceptingMentees: true,
      title: "Senior Software Engineer",
      organization: "Dev Weekends",
    });
  } else {
    await models.MenteeProfile.create({
      userId: user.id,
      currentOccupation: occupation || null,
      lastActivityDate: lastActivityDate || null,
      currentLevel: level || 1,
    });
  }
  return user;
}

async function seed() {
  console.log("🔍 Connecting to database…");
  await sequelize.authenticate();
  console.log("✅ Database connected\n");

  await cleanupDemo();

  // ── People ────────────────────────────────────────────────────────────────
  console.log("👤 Creating users…");
  const admin = await makeUser({ first: "Dana", last: "Reyes", emailLocal: "admin", role: "admin" });
  const aisha = await makeUser({ first: "Aisha", last: "Khan", emailLocal: "mentor.aisha", role: "mentor" });
  const omar = await makeUser({ first: "Omar", last: "Farooq", emailLocal: "mentor.omar", role: "mentor" });
  // A co-mentor on the Backend clan — showcases the co-mentor experience
  // (full lead parity by default, with a per-person permission override below).
  const sam = await makeUser({ first: "Sam", last: "Rivera", emailLocal: "mentor.sam", role: "mentor" });

  // The roster. The hero clan ("MERN Fellows") carries 20 mentees so the cockpit,
  // review round, leaderboard and clan analytics all have a real cohort to show;
  // a second, smaller clan exists so clan COMPARISON has something to compare.
  // occupation + lastActivityDate feed the risk/fairness math directly, and the
  // archetype decides how far along the 32-step roadmap each person sits.
  const menteeSpecs = MENTEE_SPECS;

  const mentees = {};
  for (const s of menteeSpecs) {
    const u = await makeUser({
      first: s.first, last: s.last, emailLocal: s.local, role: "mentee",
      occupation: s.occupation, lastActivityDate: s.active == null ? null : daysAgo(s.active),
      level: 1,
    });
    mentees[s.local] = { user: u, spec: s };
  }
  console.log(`✅ ${1 + 3 + menteeSpecs.length} users created (1 admin, 3 mentors, ${menteeSpecs.length} mentees)\n`);

  // ── Program + cohort ────────────────────────────────────────────────────────
  console.log("📚 Creating program, cohort & clans…");
  const program = await models.Program.create({
    createdBy: admin.id,
    name: PROGRAM_NAME,
    description:
      "A 16-week, project-based MERN fellowship taking engineers from JavaScript fundamentals to a deployed, tested, production-shaped MongoDB / Express / React / Node application — with weekly mentor reviews, clan-based peer support and a graded capstone.",
    type: "mentorship",
    status: "published",
    visibility: "private",
    totalDurationWeeks: 16,
    estimatedHoursPerWeek: 12,
    startDate: daysAgo(9 * 7), // started ~9 weeks ago, so the cohort is mid-flight
    endDate: daysAhead(7 * 7),
    currentEnrollments: MENTEE_SPECS.length,
  });

  const cohort = await models.Cohort.create({
    programId: program.id,
    name: "Spring 2026 Cohort",
    status: "running",
    startDate: daysAgo(9 * 7),
    endDate: daysAhead(7 * 7),
    createdBy: admin.id,
  });

  const feClan = await models.Clan.create({
    programId: program.id,
    name: "MERN Fellows",
    description: "The main clan for the Spring 2026 MERN cohort — 20 fellows, led by Aisha with Sam co-mentoring.",
    leadMentorId: aisha.id,
    maxMentees: 25,
    status: "active",
    healthStatus: "green",
    tags: ["mern", "react", "node", "mongodb"],
    createdBy: admin.id,
  });
  const beClan = await models.Clan.create({
    programId: program.id,
    name: "Node Guild",
    description: "A smaller second clan on the same program, so clan comparison and fairness analytics have a peer to measure against.",
    leadMentorId: omar.id,
    maxMentees: 25,
    status: "active",
    healthStatus: "amber",
    tags: ["node", "express", "api"],
    createdBy: admin.id,
  });

  // Lead-mentor memberships (this is how the mentor cockpit discovers its cohort).
  await models.ClanMembership.create({ clanId: feClan.id, userId: aisha.id, role: "lead_mentor", status: "active" });
  await models.ClanMembership.create({ clanId: beClan.id, userId: omar.id, role: "lead_mentor", status: "active" });

  // Sam co-mentors the BIG clan alongside Aisha — that's the pair the demo walks
  // through, so lead and co-mentor are looking at the same 20 fellows.
  await models.ClanMembership.create({ clanId: feClan.id, userId: sam.id, role: "co_mentor", status: "active" });
  // …with one permission turned off for him, to demo the per-co-mentor toggle:
  // he can mentor fully but can't see clan-wide analytics.
  if (models.ClanMemberPermission) {
    await models.ClanMemberPermission.create({
      clanId: feClan.id, userId: sam.id, denied: ["analytics.view"], updatedBy: aisha.id,
    });
  }
  console.log(`✅ Program, cohort & 2 clans created — MERN Fellows (${MENTEE_SPECS.filter((m) => m.clan === "HERO").length} fellows, lead + co-mentor) and Node Guild\n`);

  // ── Public clan join link (MERN Fellows) ────────────────────────────────────
  // Admin has allowed it; Lead has enabled the link. One pending request lets
  // mentor.aisha exercise approve/reject without touching real mentees.
  const DEMO_PUBLIC_JOIN_SLUG = "DemoMERNJoin";
  if (models.ClanJoinRequest) {
    console.log("🔗 Seeding public clan join link…");
    await feClan.update({
      publicJoinAllowed: true,
      publicJoinEnabled: true,
      publicJoinSlug: DEMO_PUBLIC_JOIN_SLUG,
    });

    const joinTester = await makeUser({
      first: "Jordan",
      last: "Tester",
      emailLocal: "join.tester",
      role: "mentee",
      occupation: "Aspiring Developer",
      lastActivityDate: daysAgo(1),
    });
    await models.Enrollment.create({
      menteeId: joinTester.id,
      programId: program.id,
      status: "pending_match",
      enrolledAt: daysAgo(2),
    });
    await models.ClanJoinRequest.create({
      clanId: feClan.id,
      userId: joinTester.id,
      status: "pending",
      source: "public_link",
      message: "Found the link on Slack — would love to join MERN Fellows.",
    });
    console.log(`✅ Public join enabled (/clan/join/${DEMO_PUBLIC_JOIN_SLUG}) with 1 pending request\n`);
  }

  // ── Roadmap + tasks ──────────────────────────────────────────────────────────
  console.log("🗺️  Creating roadmap & tasks…");
  const roadmap = await models.Roadmap.create({
    programId: program.id,
    name: "MERN Stack Mastery Roadmap",
    description:
      "The full 16-week spine every fellow follows: foundations, React, Node & Express, MongoDB, full-stack integration, then a shipped capstone. Five phases, 32 steps.",
    isBaseRoadmap: true,
    source: "org", // the shared org library roadmap mentors import + assign
    published: true,
    totalWeeks: 16,
    totalTasks: 32,
    skillTags: ["html", "css", "javascript", "react", "redux", "node", "express", "mongodb", "mongoose", "jwt", "testing", "ci/cd"],
  });

  // A real MERN curriculum: 32 steps across 16 weeks, ordered so the roadmap
  // reads like a course rather than a list. Every mentee sits somewhere on this
  // one spine, which is what makes the "where do I stand" view worth showing.
  const taskDefs = [
    // ── Phase 1 · Foundations (weeks 1-3) ──────────────────────────────────
    { title: "Semantic HTML & accessible layout", type: "project", difficulty: "easy", week: 1, deliverable: "A responsive, accessible landing page scoring 95+ on Lighthouse a11y.", phase: "Foundations" },
    { title: "Modern CSS, Flexbox & Grid", type: "exercise", difficulty: "easy", week: 1, deliverable: "A mobile-first component library: cards, nav, modal, form.", phase: "Foundations" },
    { title: "JavaScript fundamentals: types, scope & closures", type: "practical", difficulty: "easy", week: 2, deliverable: "20 kata solutions with a written note on why each works.", phase: "Foundations" },
    { title: "The DOM, events & the event loop", type: "practical", difficulty: "medium", week: 2, deliverable: "An interactive to-do app in vanilla JS — no frameworks.", phase: "Foundations" },
    { title: "Async JavaScript: promises, async/await, error handling", type: "assignment", difficulty: "medium", week: 3, deliverable: "A weather dashboard consuming a public API with real error states.", phase: "Foundations" },
    { title: "Git, branching & a reviewable pull request", type: "exercise", difficulty: "easy", week: 3, deliverable: "A feature branch, a clean history and a PR another fellow approves.", phase: "Foundations" },

    // ── Phase 2 · React (weeks 4-7) ────────────────────────────────────────
    { title: "React fundamentals: JSX, props & rendering", type: "project", difficulty: "medium", week: 4, deliverable: "A product listing built from a static data file.", phase: "React" },
    { title: "State, effects & the rules of hooks", type: "project", difficulty: "medium", week: 4, deliverable: "A live search with debouncing and a loading state.", phase: "React" },
    { title: "Forms, validation & controlled inputs", type: "assignment", difficulty: "medium", week: 5, deliverable: "A multi-step signup form with per-field validation.", phase: "React" },
    { title: "React Router & protected routes", type: "practical", difficulty: "medium", week: 5, deliverable: "A multi-view SPA with an auth-gated area.", phase: "React" },
    { title: "Custom hooks & composition", type: "exercise", difficulty: "medium", week: 6, deliverable: "Three reusable hooks with tests: useFetch, useDebounce, useLocalStorage.", phase: "React" },
    { title: "Context, reducers & when to reach for Redux", type: "project", difficulty: "hard", week: 6, deliverable: "A cart with global state, written twice: Context then Redux Toolkit.", phase: "React" },
    { title: "Performance: memo, lazy loading & profiling", type: "assignment", difficulty: "hard", week: 7, deliverable: "A profiled before/after with the wasted renders removed.", phase: "React" },
    { title: "Component testing with React Testing Library", type: "practical", difficulty: "medium", week: 7, deliverable: "A tested component suite covering behaviour, not implementation.", phase: "React" },

    // ── Phase 3 · Node & Express (weeks 8-11) ──────────────────────────────
    { title: "Node fundamentals & the module system", type: "practical", difficulty: "medium", week: 8, deliverable: "A CLI tool that reads, transforms and writes files.", phase: "Node" },
    { title: "Express routing, middleware & error handling", type: "project", difficulty: "medium", week: 8, deliverable: "A REST API skeleton with a single error envelope.", phase: "Node" },
    { title: "REST design: resources, status codes & versioning", type: "assignment", difficulty: "medium", week: 9, deliverable: "An OpenAPI spec reviewed by your mentor before you build it.", phase: "Node" },
    { title: "MongoDB & Mongoose: schemas, refs & indexes", type: "project", difficulty: "hard", week: 9, deliverable: "A modelled blog domain with indexes justified in writing.", phase: "Node" },
    { title: "Aggregation pipelines & query performance", type: "assignment", difficulty: "hard", week: 10, deliverable: "Three reports built as pipelines, each with explain() output.", phase: "Node" },
    { title: "Authentication: JWT, refresh tokens & sessions", type: "project", difficulty: "hard", week: 10, deliverable: "Signup, login, refresh and logout — with rotation handled.", phase: "Node" },
    { title: "Authorization: roles, ownership & guarding routes", type: "assignment", difficulty: "hard", week: 11, deliverable: "Role-scoped endpoints with tests proving the denials.", phase: "Node" },
    { title: "File uploads, validation & rate limiting", type: "practical", difficulty: "medium", week: 11, deliverable: "A hardened upload endpoint with size, type and rate limits.", phase: "Node" },

    // ── Phase 4 · Full-stack integration (weeks 12-14) ──────────────────────
    { title: "Wiring React to your API: data fetching & caching", type: "project", difficulty: "hard", week: 12, deliverable: "The frontend consuming your own API with cache invalidation.", phase: "Integration" },
    { title: "Real-time features with Socket.IO", type: "project", difficulty: "hard", week: 12, deliverable: "Live notifications that survive a reconnect.", phase: "Integration" },
    { title: "Integration testing the full stack", type: "assignment", difficulty: "hard", week: 13, deliverable: "A test suite hitting a real test database, green in CI.", phase: "Integration" },
    { title: "Environment config, secrets & the twelve-factor app", type: "exercise", difficulty: "medium", week: 13, deliverable: "A config layer with no secret ever committed.", phase: "Integration" },
    { title: "Deployment: CI/CD, migrations & rollbacks", type: "project", difficulty: "hard", week: 14, deliverable: "A deployed app with an automated pipeline and a rollback you have practised.", phase: "Integration" },
    { title: "Observability: structured logs, health checks & alerts", type: "assignment", difficulty: "medium", week: 14, deliverable: "Logs you could debug an incident from at 2am.", phase: "Integration" },

    // ── Phase 5 · Capstone & career (weeks 15-16) ──────────────────────────
    { title: "System design for the MERN stack", type: "assignment", difficulty: "hard", week: 15, deliverable: "A design doc for your capstone: data model, endpoints, trade-offs.", phase: "Capstone" },
    { title: "Capstone build: ship it end to end", type: "project", difficulty: "hard", week: 15, deliverable: "A working, deployed product with a README somebody else can run.", phase: "Capstone" },
    { title: "Code review, refactoring & paying down debt", type: "practical", difficulty: "medium", week: 16, deliverable: "A refactor PR on a peer's capstone, reviewed and merged.", phase: "Capstone" },
    { title: "Portfolio, README & the technical interview", type: "assignment", difficulty: "medium", week: 16, deliverable: "A portfolio page, a written project story and a mock interview sat.", phase: "Capstone" },
  ];
  // The step body the mentee actually reads. Written once so the org roadmap and
  // every imported local copy stay identical — the "complete roadmap" view shows
  // this for all 32 steps, not just the ones a mentee has been assigned.
  const stepBody = (d) =>
    `<p><strong>Phase ${d.phase} · Week ${d.week}</strong></p>` +
    `<p>${d.title}. Work through the material, build the deliverable, then submit it for mentor review.</p>` +
    `<p><strong>Deliverable:</strong> ${d.deliverable}</p>` +
    `<p><strong>Done when:</strong> it runs from a clean clone, the README explains how, and your mentor has signed it off.</p>`;

  const roadmapTasks = [];
  for (let i = 0; i < taskDefs.length; i++) {
    const d = taskDefs[i];
    roadmapTasks.push(
      await models.RoadmapTask.create({
        roadmapId: roadmap.id,
        title: d.title,
        description: stepBody(d),
        type: d.type,
        difficulty: d.difficulty,
        taskOrder: i + 1,
        deliverable: d.deliverable,
        estimatedHours: d.difficulty === "hard" ? 14 : d.difficulty === "medium" ? 10 : 6,
        pointsBase: d.difficulty === "hard" ? 25 : d.difficulty === "medium" ? 15 : 10,
      })
    );
  }
  console.log(`✅ Org roadmap + ${roadmapTasks.length} tasks created\n`);

  // Each lead mentor IMPORTS the org roadmap into their own local copy (the real
  // mentor flow), with its own step rows. Mentees are then assigned tasks from
  // their clan lead's local copy — so "My roadmaps" is populated and the
  // lineage-aware "already assigned" logic has realistic data to work with.
  async function importLocalCopy(mentorId) {
    const copy = await models.Roadmap.create({
      programId: program.id,
      name: roadmap.name,
      description: roadmap.description,
      source: "local",
      published: false,
      importedFrom: roadmap.id,
      ownerMentorId: mentorId,
      isBaseRoadmap: false,
      totalWeeks: 16,
      totalTasks: taskDefs.length,
      skillTags: roadmap.skillTags,
    });
    const tasks = [];
    for (let i = 0; i < taskDefs.length; i++) {
      const d = taskDefs[i];
      tasks.push(
        await models.RoadmapTask.create({
          roadmapId: copy.id,
          title: d.title,
          description: stepBody(d),
          type: d.type,
          difficulty: d.difficulty,
          taskOrder: i + 1,
          deliverable: d.deliverable,
          estimatedHours: d.difficulty === "hard" ? 14 : d.difficulty === "medium" ? 10 : 6,
          pointsBase: d.difficulty === "hard" ? 25 : d.difficulty === "medium" ? 15 : 10,
        })
      );
    }
    return { roadmap: copy, tasks };
  }
  const feRoadmap = await importLocalCopy(aisha.id);
  const beRoadmap = await importLocalCopy(omar.id);
  console.log("✅ Lead mentors imported their local roadmap copies\n");

  // ── Per-mentee enrollment + assigned tasks (the heart of the demo) ────────────
  console.log("🎯 Enrolling mentees & assigning work…");

  // archetype → how many roadmap tasks to assign and in what shape.
  // Returns a list of { idx, status, late, completedDaysAgo, dueDaysFromNow }.
  // How far along the 32-step roadmap each archetype sits, and in what shape.
  // Expressed as a POSITION (how many steps cleared) rather than hand-listed
  // indexes, so the plan scales with the roadmap instead of breaking when steps
  // are added. Returns { week, progress, tasks:[{ idx, status, ... }] }.
  const TOTAL_STEPS = taskDefs.length;

  function planFor(archetype, seed = 0) {
    // Build a run of `cleared` completed steps, then the live tail.
    const build = ({ cleared, week, tail, lateAt = [] }) => {
      const tasks = [];
      // Completions are spread backwards through time so the activity graph,
      // streaks and "recently completed" all have a believable slope.
      for (let i = 0; i < cleared; i++) {
        const agoBase = Math.round(((cleared - i) / cleared) * 58) + 2;
        tasks.push({
          idx: i,
          status: "completed",
          completedDaysAgo: Math.max(1, agoBase + ((seed + i) % 3) - 1),
          late: lateAt.includes(i),
        });
      }
      tail.forEach((t, n) => tasks.push({ idx: cleared + n, ...t }));
      return {
        week,
        progress: Math.round((cleared / TOTAL_STEPS) * 100),
        tasks: tasks.filter((t) => t.idx < TOTAL_STEPS),
      };
    };

    switch (archetype) {
      case "star": // deep into phase 4, finishing early → low risk, momentum up
        return build({
          cleared: 21, week: 12,
          tail: [
            { status: "in_progress", dueDaysFromNow: 4 },
            { status: "assigned", dueDaysFromNow: 9 },
          ],
        });
      case "on_track": // steady, on pace with the cohort → low
        return build({
          cleared: 16, week: 10,
          tail: [
            { status: "in_progress", dueDaysFromNow: 5 },
            { status: "assigned", dueDaysFromNow: 11 },
          ],
        });
      case "disengaged": // stalled in phase 2, silent for two weeks → HIGH
        return build({
          cleared: 7, week: 9, lateAt: [5, 6],
          tail: [
            { status: "assigned", dueDaysFromNow: -12 },
            { status: "assigned", dueDaysFromNow: -5 },
            { status: "assigned", dueDaysFromNow: 3 },
          ],
        });
      case "new": // just joined mid-cohort, nothing assigned yet → LOW
        return { week: 1, progress: 0, tasks: [] };
      case "fighting": // behind, but logging real friction → WATCH, softened
        return build({
          cleared: 11, week: 9, lateAt: [8, 10],
          tail: [
            { status: "in_progress", dueDaysFromNow: 2 },
            { status: "assigned", dueDaysFromNow: 7 },
          ],
        });
      case "watch": // was fine, has gone quiet and slipped a deadline → WATCH
        return build({
          cleared: 13, week: 9,
          tail: [
            { status: "in_progress", dueDaysFromNow: -3 },
            { status: "assigned", dueDaysFromNow: 5 },
          ],
        });
      case "review": // healthy, with work sitting in the mentor's queue → LOW
        return build({
          cleared: 14, week: 10,
          tail: [
            { status: "submitted" },
            { status: "submitted" },
            { status: "assigned", dueDaysFromNow: 8 },
          ],
        });
      case "average": // unremarkable, mid-pack → LOW
      default:
        return build({
          cleared: 12, week: 9,
          tail: [
            { status: "in_progress", dueDaysFromNow: 4 },
            { status: "assigned", dueDaysFromNow: 10 },
          ],
        });
    }
  }

  for (const s of menteeSpecs) {
    const m = mentees[s.local].user;
    const clan = s.clan === "HERO" ? feClan : beClan;
    const mentor = s.clan === "HERO" ? aisha : omar;
    const local = s.clan === "HERO" ? feRoadmap : beRoadmap;
    const plan = planFor(s.archetype, menteeSpecs.indexOf(s));

    const enrollment = await models.Enrollment.create({
      menteeId: m.id,
      programId: program.id,
      cohortId: cohort.id,
      status: "active",
      currentWeek: plan.week,
      tasksCompleted: plan.tasks.filter((t) => t.status === "completed").length,
      tasksTotal: taskDefs.length,
      overallProgressPercentage: plan.progress,
      enrolledAt: daysAgo(9 * 7),
      startedAt: daysAgo(9 * 7),
      expectedCompletionDate: daysAhead(7 * 7),
      avgTaskRating: s.archetype === "star" ? 4.6 : s.archetype === "on_track" ? 4.1 : 3.6,
    });

    // Kept so the sections further down can hang custom tasks (quiz, interview)
    // off the same enrollment rather than looking it up again.
    mentees[s.local].enrollment = enrollment;

    // Clan membership ties the mentee to the mentor's cohort.
    await models.ClanMembership.create({
      clanId: clan.id, userId: m.id, role: "mentee", status: "active", enrollmentId: enrollment.id,
    });

    const rating = s.archetype === "star" ? 5 : 4;
    for (const t of plan.tasks) {
      const rt = local.tasks[t.idx]; // assigned from the lead's local roadmap copy
      const hasSubmission = ["submitted", "completed"].includes(t.status);
      const completedAt = t.status === "completed" && t.completedDaysAgo != null ? daysAgo(t.completedDaysAgo) : null;
      const dueDate = t.dueDaysFromNow != null ? daysAhead(t.dueDaysFromNow) : (completedAt ? daysAgo(t.completedDaysAgo + 5) : null);
      const submittedAt = hasSubmission ? (completedAt || daysAgo(1)) : null;

      const at = await models.AssignedTask.create({
        roadmapTaskId: rt.id,
        menteeId: m.id,
        mentorId: mentor.id,
        enrollmentId: enrollment.id,
        status: t.status,
        assignedAt: daysAgo(Math.max(2, 62 - t.idx * 2)),
        dueDate,
        startedAt: ["in_progress", "submitted", "completed"].includes(t.status) ? daysAgo(t.completedDaysAgo != null ? t.completedDaysAgo + 4 : 6) : null,
        submittedAt,
        completedAt,
        isLate: !!t.late,
        currentSubmissionVersion: hasSubmission ? 1 : 0,
        pointsAwarded: t.status === "completed" ? rt.pointsBase : 0,
        finalRating: t.status === "completed" ? rating : null,
      });

      // Real submission rows so the mentor review/feedback flow has something to
      // open — 'pending' for awaiting-review, 'approved' + feedback for completed.
      if (hasSubmission) {
        const submission = await models.TaskSubmission.create({
          assignedTaskId: at.id,
          version: 1,
          submissionText: `Here's my work for "${rt.title}" — repo and notes attached. Happy to iterate on feedback.`,
          submissionUrls: ["https://github.com/demo/pathment-fellowship"],
          status: t.status === "completed" ? "approved" : "pending",
          submittedAt: submittedAt || daysAgo(1),
        });
        if (t.status === "completed") {
          await models.TaskFeedback.create({
            assignedTaskId: at.id,
            submissionId: submission.id,
            mentorId: mentor.id,
            feedbackText: "Solid work — meets the deliverable and the code is clean and well-structured. Nice job.",
            rating,
            isApproved: true,
            decision: "approved",
            feedbackType: "general",
          });
        }
      }
    }

    // Mentee's position in the linear roadmap (drives the mentee progress view +
    // the "already assigned" lock). currentStep = how many they've cleared.
    if (models.RoadmapProgress && plan.tasks.length) {
      const cleared = plan.tasks.filter((t) => t.status === "completed").length;
      await models.RoadmapProgress.create({
        roadmapId: local.roadmap.id,
        menteeId: m.id,
        enrollmentId: enrollment.id,
        currentStep: Math.min(cleared, local.tasks.length - 1),
        completed: cleared >= local.tasks.length,
        startedAt: daysAgo(9 * 7),
      });
    }
  }
  console.log(`✅ ${menteeSpecs.length} enrollments, assigned tasks, submissions & feedback created across a ${taskDefs.length}-step roadmap\n`);

  // ── Blockers + accepted delays (drive watch/fighting + fairness credit) ───────
  console.log("🚧 Adding blockers, delays, notes & schedules…");
  const noor = mentees["mentee.noor"].user;
  const ivan = mentees["mentee.ivan"].user;
  const sara = mentees["mentee.sara"].user;

  await models.Blocker.create({
    menteeId: noor.id, createdBy: noor.id, title: "Stuck on JWT refresh-token flow",
    category: "technical", severity: "medium", status: "open", openedAt: daysAgo(3),
  });
  await models.Blocker.create({
    menteeId: ivan.id, createdBy: ivan.id, title: "Exam week — limited availability",
    category: "personal", severity: "medium", status: "open", openedAt: daysAgo(5),
  });
  await models.Blocker.create({
    menteeId: sara.id, createdBy: aisha.id, title: "No response — needs outreach",
    category: "personal", severity: "high", status: "open", openedAt: daysAgo(6),
  });

  // Noor: accepted external (job) delays → fairness credit lifts relative progress.
  await models.DelayEvent.create({
    menteeId: noor.id, reason: "Overtime at work during release week.",
    kind: "job", days: 4, accepted: true, category: "external", createdBy: omar.id, occurredAt: daysAgo(8),
  });
  await models.DelayEvent.create({
    menteeId: noor.id, reason: "Power outages disrupted study time.",
    kind: "electricity", days: 2, accepted: true, category: "external", createdBy: omar.id, occurredAt: daysAgo(3),
  });

  // ── Meeting notes (1:1s with a personality read) ──────────────────────────────
  await models.MeetingNote.create({
    menteeId: mentees["mentee.maya"].user.id, mentorId: aisha.id, createdBy: aisha.id,
    date: daysAgo(4), kind: "1:1", sentiment: "positive",
    summary: "Maya is well ahead and ready for a stretch goal. Walked through the API task early.",
    issues: [], nextSteps: ["Start the Express auth task", "Pair with a peer on testing"],
    personalityRead: "Highly self-directed, learns fast, thrives on autonomy.",
    workingStyle: { consistency: 90, communication: 80, resilience: 85, independence: 95 },
    blockers: [],
  });
  await models.MeetingNote.create({
    menteeId: noor.id, mentorId: omar.id, createdBy: omar.id,
    date: daysAgo(3), kind: "1:1", sentiment: "neutral",
    summary: "Noor is juggling a full-time job. Behind on raw % but clearly putting in real effort. Logged delays as accepted.",
    issues: ["Limited weekday hours"], nextSteps: ["Break the API task into smaller chunks", "Check in mid-week"],
    personalityRead: "Conscientious and honest about constraints; communicates blockers early.",
    workingStyle: { consistency: 70, communication: 85, resilience: 80, independence: 65 },
    blockers: ["JWT refresh-token flow"],
  });

  // ── Schedules (org template + a couple of filled mentee schedules) ────────────
  const orgTemplate = await models.ScheduleTemplate.create({
    name: "Fellowship Weekly Rhythm", source: "org", createdBy: admin.id,
    blocks: [
      { day: "Monday", label: "Clan standup", start: "09:00", end: "09:30" },
      { day: "Wednesday", label: "Focused build time", start: "14:00", end: "17:00" },
      { day: "Friday", label: "Mentor 1:1", start: "11:00", end: "11:30" },
    ],
  });
  const filledSchedule = [
    { day: "Monday", label: "Clan standup", start: "09:00", end: "09:30" },
    { day: "Wednesday", label: "Focused build time", start: "14:00", end: "17:00" },
    { day: "Friday", label: "Mentor 1:1", start: "11:00", end: "11:30" },
  ];
  await models.MenteeSchedule.create({
    menteeId: mentees["mentee.maya"].user.id, templateId: orgTemplate.id, schedule: filledSchedule, assignedBy: aisha.id,
  });
  await models.MenteeSchedule.create({
    menteeId: noor.id, templateId: orgTemplate.id, schedule: filledSchedule, assignedBy: omar.id,
  });

  // ── Announcements (org broadcasts) ─────────────────────────────────────────────
  await models.Announcement.create({
    title: "Welcome to the Spring 2026 Fellowship!", authorId: admin.id, audience: "all", pinned: true,
    body: "We're thrilled to kick off the cohort. Meet your clan, set up your schedule, and start Week 1. Reach out to your mentor anytime.",
  });
  await models.Announcement.create({
    title: "Week 7 — APIs & data modeling", authorId: admin.id, audience: "program", audienceId: program.id, pinned: false,
    body: "We're entering the backend stretch. Office hours are extended this week — book a slot with your mentor if you're stuck.",
  });

  console.log("✅ Blockers, delays, notes, schedules & announcements created\n");

  // ── Rich directory data (skills, profile stats, last-active) so the admin ────
  //    Mentors/Mentees tables look real instead of empty. ───────────────────────
  console.log("✨ Enriching profiles (skills, stats, last active)…");

  // Skills — find-or-create so it works whether or not seed:skills was run.
  const SKILL_NAMES = ["React", "Node.js", "TypeScript", "PostgreSQL", "CSS", "Testing", "Docker", "System Design", "JavaScript", "Express"];
  const skillByName = {};
  for (const name of SKILL_NAMES) {
    const [s] = await models.Skill.findOrCreate({ where: { name }, defaults: { name, category: "Engineering" } });
    skillByName[name] = s;
  }
  const attachSkills = async (userId, names, level) => {
    for (const n of names) {
      const s = skillByName[n];
      if (!s) continue;
      await models.UserSkill.findOrCreate({ where: { userId, skillId: s.id }, defaults: { userId, skillId: s.id, proficiencyLevel: level } });
    }
  };

  // Mentors: expertise + headline stats + a recent login.
  const mentorSpec = {
    [aisha.id]: ["React", "CSS", "TypeScript", "Testing"],
    [omar.id]: ["Node.js", "PostgreSQL", "Express", "System Design"],
    [sam.id]: ["JavaScript", "React", "Docker"],
  };
  for (const m of [aisha, omar, sam]) {
    const specs = mentorSpec[m.id] || [];
    await attachSkills(m.id, specs, 90);
    await models.User.update({ lastLoginAt: daysAgo(0) }, { where: { id: m.id } });
    await models.MentorProfile.update(
      { currentMenteeCount: 4, totalMenteesGuided: 6, avgFeedbackRating: 4.6, successRate: 92, specialization: specs },
      { where: { userId: m.id } }
    );
  }
  await models.User.update({ lastLoginAt: daysAgo(0) }, { where: { id: admin.id } });

  // Mentees: per-archetype gamification stats + skills + last login = last active.
  const MENTEE_STATS = {
    star:       { points: 1450, level: 6, streak: 18, tasks: 5, badges: 5, programs: 1, edu: "BSc Computer Science" },
    on_track:   { points: 820,  level: 4, streak: 7,  tasks: 4, badges: 3, programs: 1, edu: "BSc Computer Science" },
    disengaged: { points: 90,   level: 1, streak: 0,  tasks: 1, badges: 0, programs: 1, edu: "Self-learner" },
    new:        { points: 0,    level: 1, streak: 0,  tasks: 0, badges: 0, programs: 1, edu: "Bootcamp" },
    fighting:   { points: 540,  level: 3, streak: 4,  tasks: 3, badges: 2, programs: 1, edu: "Diploma in IT" },
    watch:      { points: 610,  level: 3, streak: 0,  tasks: 3, badges: 2, programs: 1, edu: "BSc (in progress)" },
    review:     { points: 700,  level: 3, streak: 5,  tasks: 4, badges: 3, programs: 1, edu: "Coding bootcamp" },
    average:    { points: 480,  level: 2, streak: 3,  tasks: 3, badges: 1, programs: 1, edu: "Self-taught" },
  };
  const MENTEE_SKILLS = ["JavaScript", "React", "CSS", "Node.js"];
  for (const s of menteeSpecs) {
    const u = mentees[s.local].user;
    const st = MENTEE_STATS[s.archetype] || MENTEE_STATS.average;
    await attachSkills(u.id, MENTEE_SKILLS.slice(0, 2 + (st.level % 3)), 50 + st.level * 5);
    await models.User.update({ lastLoginAt: s.active == null ? daysAgo(0) : daysAgo(s.active) }, { where: { id: u.id } });
    await models.MenteeProfile.update(
      {
        totalPoints: st.points, currentLevel: st.level, currentStreakDays: st.streak,
        longestStreakDays: Math.max(st.streak, st.streak + 4), totalTasksCompleted: st.tasks,
        totalBadgesEarned: st.badges, totalProgramsEnrolled: st.programs, totalProgramsCompleted: 0,
        avgTaskRating: st.points > 0 ? 4 : 0, currentEducation: st.edu,
      },
      { where: { userId: u.id } }
    );
  }
  console.log("✅ Profiles enriched (skills, points, levels, last active)\n");

  // ── Promotion pipeline (mentee → co-mentor) ──────────────────────────────────
  // Maya (the star) is nominated and marked ready, so /admin/promotions shows an
  // actionable card and the mentor Promotions page shows the pipeline.
  if (models.PromotionCandidate) {
    await models.PromotionCandidate.create({
      menteeId: mentees["mentee.maya"].user.id,
      nominatedBy: aisha.id,
      stage: "approved", // awaiting the admin's final promotion
      motivation: "Maya is well ahead of the cohort with a perfect on-time record and already helps peers unblock.",
      strengths: "Reliable, self-directed, and a clear communicator — a natural fit to co-lead.",
      availability: "5 hours / week",
    });
    console.log("✅ Promotion candidate created (Maya — awaiting admin)\n");
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  Newer feature areas (these tables didn't exist when the seeder was first
  //  written, so the demo looked empty on those screens). Everything below is
  //  scoped to demo users / the demo program and torn down by cleanupDemo().
  // ════════════════════════════════════════════════════════════════════════════

  // Small date helpers for the new sections.
  const ymd = (d) => d.toISOString().slice(0, 10); // DATEONLY 'YYYY-MM-DD'
  const dayLabel = (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const TZ = "Asia/Karachi";

  // Resolved mentee records with their clan + lead mentor (used throughout).
  const menteeList = menteeSpecs.map((s) => ({
    user: mentees[s.local].user,
    spec: s,
    enrollmentId: mentees[s.local].enrollment.id,
    clan: s.clan === "HERO" ? feClan : beClan,
    mentor: s.clan === "HERO" ? aisha : omar,
  }));
  const feMentees = menteeList.filter((m) => m.spec.clan === "HERO");
  const beMentees = menteeList.filter((m) => m.spec.clan === "SIDE");
  const byLocal = (l) => mentees[l].user;

  // ── Cohort review sessions + attendance ──────────────────────────────────────
  // One finished review from last week (fully marked) + today's in-progress one
  // (only some marked, so the new round attendance strip shows real + "not yet
  // marked" states). This is what powers /mentor/review and the attendance UI.
  if (models.CohortReviewSession && models.CohortReviewEntry) {
    console.log("📋 Seeding cohort review sessions & attendance…");
    const ATT_BY_ARCH = {
      star: "present", on_track: "present", review: "present", average: "present",
      fighting: "present", watch: "excused", disengaged: "absent", new: "present",
    };
    async function seedReview(clan, mentor, clanMentees) {
      // Last week — a finished, fully-marked review.
      const finished = await models.CohortReviewSession.create({
        mentorId: mentor.id, clanId: clan.id, sessionDate: ymd(daysAgo(7)),
        title: "Weekly review — last week", status: "finished", finishedAt: daysAgo(7),
        note: "Solid momentum overall. Flagged two mentees for closer follow-up this week.",
      });
      for (const m of clanMentees) {
        await models.CohortReviewEntry.create({
          sessionId: finished.id, menteeId: m.user.id,
          attendance: ATT_BY_ARCH[m.spec.archetype] || "present", status: "reviewed",
        });
      }
      // Today — in-progress: mark roughly the first half, leave the rest unmarked.
      const today = await models.CohortReviewSession.create({
        mentorId: mentor.id, clanId: clan.id, sessionDate: ymd(new Date()),
        title: "Weekly review", status: "in_progress", note: null,
      });
      const half = Math.ceil(clanMentees.length / 2);
      for (let i = 0; i < clanMentees.length; i++) {
        const m = clanMentees[i];
        if (i < half) {
          await models.CohortReviewEntry.create({
            sessionId: today.id, menteeId: m.user.id,
            attendance: ATT_BY_ARCH[m.spec.archetype] || "present", status: "reviewed",
          });
        }
        // The rest get no entry yet → they render as "not marked" in the strip.
      }
    }
    await seedReview(feClan, aisha, feMentees);
    await seedReview(beClan, omar, beMentees);
    console.log("✅ Cohort review sessions + attendance created (last week + today)\n");
  }

  // ── 1:1 scheduling — availability slots + booked meetings ─────────────────────
  if (models.AvailabilitySlot && models.ScheduledMeeting) {
    console.log("🗓️  Seeding availability slots & 1:1 meetings…");
    async function openSlot(mentor, daysFromNow, hour) {
      const at = daysAhead(daysFromNow); at.setHours(hour, 0, 0, 0);
      return models.AvailabilitySlot.create({
        mentorId: mentor.id, day: dayLabel(at), date: ymd(at),
        time: `${String(hour).padStart(2, "0")}:00`, durationMins: 30, startsAt: at, timezone: TZ,
      });
    }
    async function book(mentor, mentee, daysFromNow, hour, status, reason) {
      const at = daysFromNow >= 0 ? daysAhead(daysFromNow) : daysAgo(-daysFromNow);
      at.setHours(hour, 0, 0, 0);
      const time = `${String(hour).padStart(2, "0")}:00`;
      const slot = await models.AvailabilitySlot.create({
        mentorId: mentor.id, day: dayLabel(at), date: ymd(at), time, durationMins: 30,
        startsAt: at, timezone: TZ, taken: true, takenBy: mentee.id,
      });
      await models.ScheduledMeeting.create({
        mentorId: mentor.id, menteeId: mentee.id, availabilitySlotId: slot.id, kind: "1:1",
        day: dayLabel(at), time, durationMins: 30, startsAt: at, timezone: TZ, status,
        agenda: status === "cancelled" ? "Unblock the API task" : "Weekly 1:1 — progress, blockers & next steps",
        cancellationReason: reason || null, cancelledBy: reason ? mentee.id : null,
      });
    }
    // A few open slots each, then some booked meetings spanning the lifecycle.
    for (const mentor of [aisha, omar]) {
      await openSlot(mentor, 1, 11);
      await openSlot(mentor, 2, 15);
      await openSlot(mentor, 4, 16);
    }
    await book(aisha, byLocal("mentee.maya"), 2, 14, "scheduled");
    await book(aisha, byLocal("mentee.leo"), -3, 15, "done");
    await book(omar, byLocal("mentee.noor"), 1, 16, "scheduled");
    await book(omar, byLocal("mentee.priya"), -1, 13, "cancelled", "Hit a work deadline — will rebook for next week.");
    console.log("✅ Availability slots + 1:1 meetings created (open / upcoming / completed / cancelled)\n");
  }

  // ── Direct messages (mentor ↔ mentee threads) ────────────────────────────────
  if (models.Conversation && models.ConversationParticipant && models.Message) {
    console.log("✉️  Seeding direct message threads…");
    async function thread(a, b, msgs) {
      const directKey = [a.id, b.id].sort().join(":");
      const convo = await models.Conversation.create({
        type: "direct", createdBy: a.id, metadata: { directKey },
      });
      await models.ConversationParticipant.bulkCreate([
        { conversationId: convo.id, userId: a.id, role: "owner" },
        { conversationId: convo.id, userId: b.id, role: "participant" },
      ]);
      let last = null;
      for (const m of msgs) {
        const sender = m.from === "a" ? a : b;
        const recipient = m.from === "a" ? b : a;
        const when = daysAgo(m.ago);
        last = await models.Message.create({
          senderId: sender.id, recipientId: recipient.id, threadId: convo.id,
          messageText: m.text, isRead: !!m.read, readAt: m.read ? daysAgo(Math.max(0, m.ago - 1)) : null,
          deliveredAt: when, createdAt: when, updatedAt: when,
        });
      }
      if (last) await convo.update({ lastMessageId: last.id, lastMessageAt: last.createdAt }, { silent: true });
    }
    // Long-running threads, so the messaging screen has real history to scroll
    // rather than three lines. Ordered oldest → newest by `ago`.
    await thread(byLocal("mentee.maya"), aisha, [
      { from: "a", text: "Hi Aisha! Just finished the custom hooks step. useDebounce was the one that finally made hooks click for me.", ago: 21, read: true },
      { from: "b", text: "That's exactly the step where it lands for most people 🙌 Did you write tests for all three?", ago: 21, read: true },
      { from: "a", text: "All three, yeah. useLocalStorage was fiddly because of the JSON parse throwing on bad data.", ago: 20, read: true },
      { from: "b", text: "Good catch — that's a real bug most people ship. Wrap it and return a default.", ago: 20, read: true },
      { from: "a", text: "Done. Moving on to the Redux vs Context task now.", ago: 18, read: true },
      { from: "b", text: "Write the Context version first and let it get painful. The Redux version means more once you have felt why.", ago: 18, read: true },
      { from: "a", text: "That was good advice. Prop drilling through four levels made the point 😅", ago: 14, read: true },
      { from: "a", text: "I finished the React performance step early — could I get a stretch goal?", ago: 4, read: true },
      { from: "b", text: "Love the energy. Take a look at the JWT refresh-token task and let's pair on testing Friday.", ago: 4, read: true },
      { from: "a", text: "On it. Thank you!", ago: 3, read: true },
      { from: "b", text: "Also — I've nominated you for co-mentor. You've been helping the others all cohort.", ago: 1, read: false },
    ]);
    await thread(byLocal("mentee.noor"), aisha, [
      { from: "a", text: "Aisha, work has been brutal this month. I logged the delays but I am stuck on the JWT refresh flow.", ago: 12, read: true },
      { from: "b", text: "No worries Noor — you have been honest and consistent, that counts. Let's break the auth task into smaller chunks on our 1:1.", ago: 12, read: true },
      { from: "a", text: "That would help. The part I can't get is what happens when two tabs refresh at the same time.", ago: 11, read: true },
      { from: "b", text: "Great question, and the answer is most production apps get it wrong. Look up refresh-token rotation with reuse detection.", ago: 11, read: true },
      { from: "a", text: "Read that twice and I think I have it. Single-flight the refresh so only one request goes out.", ago: 9, read: true },
      { from: "b", text: "Exactly right. That is a senior-level answer.", ago: 9, read: true },
      { from: "a", text: "Submitted the auth task. Late, but it works and the tests pass.", ago: 3, read: true },
      { from: "b", text: "Late and working beats on-time and broken. Reviewing tonight.", ago: 2, read: true },
      { from: "b", text: "Dropped a couple of links in your task feedback. Shout if they don't help.", ago: 1, read: false },
    ]);
    await thread(byLocal("mentee.priya"), sam, [
      { from: "a", text: "Hi Sam — submitted both the aggregation and the auth tasks for review, keen to hear your thoughts!", ago: 6, read: true },
      { from: "b", text: "Got them. The aggregation pipelines look strong, I especially liked that you attached the explain() output without being asked.", ago: 5, read: true },
      { from: "a", text: "That was the bit I found most interesting honestly — watching an index take a query from 400ms to 3ms.", ago: 5, read: true },
      { from: "b", text: "That feeling is why people end up liking databases. One note on the auth task coming in the feedback.", ago: 4, read: true },
      { from: "a", text: "Anything I should read before the capstone design doc?", ago: 2, read: false },
    ]);
    await thread(byLocal("mentee.sara"), aisha, [
      { from: "b", text: "Hi Sara — noticed it has been a couple of weeks. No pressure at all, just checking you are OK.", ago: 9, read: true },
      { from: "b", text: "Your spot is not going anywhere. If the pace is wrong we can change the pace.", ago: 5, read: false },
      { from: "b", text: "Still here whenever you want to pick it back up. Even 20 minutes counts.", ago: 2, read: false },
    ]);
    await thread(byLocal("mentee.lina"), aisha, [
      { from: "a", text: "Quick one — for the integration testing step, should I be spinning up a real Mongo or mocking it?", ago: 7, read: true },
      { from: "b", text: "Real one, in a test database. Mocking your own datastore tests the mock, not the app.", ago: 7, read: true },
      { from: "a", text: "That's what I hoped you'd say. Docker compose it is.", ago: 6, read: true },
      { from: "b", text: "Add it to the CI pipeline too while you are in there — that step is coming up anyway.", ago: 6, read: true },
      { from: "a", text: "Pipeline is green ✅ Screenshot in the submission.", ago: 3, read: true },
    ]);
    await thread(byLocal("mentee.diego"), sam, [
      { from: "a", text: "Sam, my React Router protected routes flash the login page for a second before redirecting. Is that normal?", ago: 8, read: true },
      { from: "b", text: "Not normal, but very common. You are rendering before the auth check resolves — you need a loading state between 'unknown' and 'logged out'.", ago: 8, read: true },
      { from: "a", text: "Ahh. Three states not two. Fixed it, thank you!", ago: 7, read: true },
    ]);
    await thread(byLocal("mentee.ivan"), aisha, [
      { from: "b", text: "Ivan, the Context/Redux task went past its due date — anything blocking you?", ago: 4, read: true },
      { from: "a", text: "Exams. I should have flagged it earlier, sorry.", ago: 3, read: true },
      { from: "b", text: "Log it as a delay and I will move the deadline. Flagging early is the whole point, not a failure.", ago: 3, read: false },
    ]);
    await thread(byLocal("mentee.tom"), aisha, [
      { from: "b", text: "Welcome to the clan, Tom! I have not assigned anything yet — let's talk on Thursday and start you at the right step.", ago: 2, read: false },
    ]);
    await thread(aisha, sam, [
      { from: "a", text: "Sam, can you take the review queue for the back half of the clan this week? I have 11 waiting.", ago: 5, read: true },
      { from: "b", text: "Yep, I will take everyone from Kwame onwards. Anything I should know?", ago: 5, read: true },
      { from: "a", text: "Hassan has gone quiet — second week now. Worth a gentle nudge rather than a task.", ago: 5, read: true },
      { from: "b", text: "Will do. Also Priya's aggregation work is the best I have seen this cohort, worth calling out in review.", ago: 4, read: true },
      { from: "a", text: "Agreed. I will put her up on the leaderboard shout-out.", ago: 4, read: true },
    ]);
    await thread(aisha, omar, [
      { from: "a", text: "How is Node Guild tracking? Mine are averaging week 10 of 16.", ago: 6, read: true },
      { from: "b", text: "Similar, maybe half a week behind. The aggregation step is where everyone slows down.", ago: 6, read: true },
      { from: "a", text: "Same here. Might be worth splitting it into two steps next cohort.", ago: 5, read: true },
    ]);
    console.log("✅ Direct message threads created (10 threads, mentor↔mentee and mentor↔mentor, with real history)\n");
  }

  // ── Notifications (the bell — varied types, read + unread) ────────────────────
  if (models.Notification) {
    console.log("🔔 Seeding notifications…");
    const notify = (userId, type, title, message, o = {}) => models.Notification.create({
      userId, type, title, message, status: o.read ? "read" : "unread",
      actionUrl: o.actionUrl || null, actionLabel: o.actionLabel || null,
      relatedEntityType: o.ret || null, relatedEntityId: o.reid || null,
      readAt: o.read ? daysAgo(Math.max(0, (o.ago ?? 1) - 1)) : null,
      sentAt: daysAgo(o.ago ?? 1), createdAt: daysAgo(o.ago ?? 1), updatedAt: daysAgo(o.ago ?? 1),
    });
    // Mentors
    await notify(omar.id, "task", "Priya submitted 2 tasks for review", "Priya Sharma has work waiting on your review.", { actionUrl: "/mentor/approvals", actionLabel: "Review", ago: 1 });
    await notify(omar.id, "system", "Noor logged a blocker", "“Stuck on JWT refresh-token flow” — Noor Hassan.", { actionUrl: "/mentor/mentees", ago: 1 });
    await notify(aisha.id, "task", "Maya submitted a task", "Maya Patel submitted “React components & state”.", { actionUrl: "/mentor/approvals", actionLabel: "Review", ago: 2, read: true });
    await notify(aisha.id, "milestone", "Maya is ready for more", "Maya is well ahead of pace — consider a stretch goal.", { actionUrl: "/mentor/mentees", ago: 3, read: true });
    // Admin
    await notify(admin.id, "milestone", "Maya nominated for co-mentor", "Aisha nominated Maya Patel. Awaiting your approval.", { actionUrl: "/admin/promotions", actionLabel: "Open", ago: 2 });
    // Mentees
    await notify(byLocal("mentee.maya").id, "feedback", "Your task was approved 🎉", "Aisha approved “React components & state”. Nice work!", { actionUrl: "/mentee/tasks", actionLabel: "View", ago: 2, read: true });
    await notify(byLocal("mentee.noor").id, "task", "New task assigned", "Omar assigned “REST APIs with Node & Express”.", { actionUrl: "/mentee/tasks", actionLabel: "Start", ago: 1 });
    await notify(byLocal("mentee.sara").id, "system", "Your mentor checked in", "Aisha sent you a nudge — jump back in when you can.", { actionUrl: "/mentee/dashboard", ago: 1 });
    await notify(byLocal("mentee.priya").id, "feedback", "Feedback received", "Omar left feedback on your submission.", { actionUrl: "/mentee/tasks", ago: 1 });
    console.log("✅ Notifications created (mentors, admin & mentees)\n");
  }

  // ── Community posts + comments + reactions ────────────────────────────────────
  // Scopes: clan-private, program-wide, and global. Includes a resolved question
  // with an accepted answer and some kudos, so every community surface has life.
  if (models.CommunityPost && models.CommunityComment && models.CommunityReaction) {
    console.log("💬 Seeding community posts, comments & reactions…");
    const REACTIONS = ["cheers", "celebrate", "insightful", "helpful"];
    async function makePost(author, o) {
      const p = await models.CommunityPost.create({
        authorId: author.id, type: o.type || "discussion",
        scopeType: o.scopeType, scopeId: o.scopeId || null,
        title: o.title || null, body: o.body, toId: o.toId || null,
        tags: o.tags || [], resolved: !!o.resolved, commentCount: 0,
        createdAt: daysAgo(o.ago ?? 2), updatedAt: daysAgo(o.ago ?? 2),
      });
      let acceptedCommentId = null;
      const comments = o.comments || [];
      for (let i = 0; i < comments.length; i++) {
        const c = comments[i];
        const comment = await models.CommunityComment.create({
          postId: p.id, authorId: c.author.id, body: c.body,
          createdAt: daysAgo(c.ago ?? 1), updatedAt: daysAgo(c.ago ?? 1),
        });
        if (c.accepted) acceptedCommentId = comment.id;
      }
      const reactors = o.reactors || [];
      for (let i = 0; i < reactors.length; i++) {
        await models.CommunityReaction.create({
          postId: p.id, userId: reactors[i].id, type: REACTIONS[i % REACTIONS.length],
        });
      }
      const patch = { commentCount: comments.length };
      if (acceptedCommentId) patch.acceptedCommentId = acceptedCommentId;
      await p.update(patch, { silent: true });
      return p;
    }
    // Frontend clan — a resolved question with an accepted answer.
    await makePost(byLocal("mentee.leo"), {
      type: "question", scopeType: "clan", scopeId: feClan.id, resolved: true,
      title: "How do you structure React context for a multi-view dashboard?",
      body: "I keep prop-drilling. Splitting into multiple contexts vs one big store — what do you all do?",
      tags: ["react", "state"], ago: 3,
      comments: [
        { author: byLocal("mentee.maya"), body: "Split by concern — one context per domain. Way easier to test.", accepted: true, ago: 2 },
        { author: aisha, body: "Great answer Maya. Leo, start with 2–3 small contexts and only reach for a store if it gets noisy.", ago: 2 },
      ],
      reactors: [byLocal("mentee.maya"), aisha, byLocal("mentee.tom")],
    });
    // Frontend clan — a kudos shout-out.
    await makePost(aisha, {
      type: "kudos", scopeType: "clan", scopeId: feClan.id, toId: byLocal("mentee.maya").id,
      body: "Big shout-out to Maya for helping two peers unblock this week 👏", ago: 1,
      reactors: [byLocal("mentee.leo"), byLocal("mentee.tom"), omar],
    });
    // Backend clan — a real blocker turned discussion.
    await makePost(byLocal("mentee.noor"), {
      type: "question", scopeType: "clan", scopeId: beClan.id,
      title: "JWT refresh-token rotation — where do you store the refresh token?",
      body: "httpOnly cookie vs DB session table? Trying to get the security right without overcomplicating.",
      tags: ["node", "auth", "security"], ago: 2,
      comments: [{ author: omar, body: "httpOnly + secure cookie for the refresh token, rotate on use, keep a server-side allowlist. We'll walk through it on our 1:1.", ago: 1 }],
      reactors: [byLocal("mentee.priya"), byLocal("mentee.ivan")],
    });
    // Program-wide win + a global welcome.
    await makePost(byLocal("mentee.priya"), {
      type: "win", scopeType: "program", scopeId: program.id,
      body: "Shipped my first CRUD API with auth today 🚀 Three weeks ago I'd never touched Express. Thank you mentors!",
      tags: ["milestone"], ago: 2,
      reactors: [aisha, omar, byLocal("mentee.maya"), byLocal("mentee.noor")],
    });
    await makePost(admin, {
      type: "discussion", scopeType: "global",
      title: "Welcome to the Spring 2026 Fellowship 👋",
      body: "Introduce yourself, find your clan, and don't be shy about asking questions here. We're all building together.",
      ago: 6, reactors: [aisha, omar, byLocal("mentee.leo"), byLocal("mentee.jack")],
    });
    console.log("✅ Community posts, comments & reactions created\n");
  }

  // ── Anonymous mentor feedback (program_reviews) ───────────────────────────────
  // ≥3 reviews per mentor so the mentor's "How your mentees rate you" card
  // unlocks (the reveal gate is 3) and admin moderation has data.
  if (models.ProgramReview) {
    console.log("⭐ Seeding anonymous mentor feedback…");
    const dims = (a, b, c, d) => ({ responsiveness: a, helpfulness: b, clarity: c, support: d });
    async function review(reviewer, mentor, rating, d, text, rec) {
      await models.ProgramReview.create({
        programId: program.id, reviewerId: reviewer.id, mentorId: mentor.id,
        rating, dimensions: d, reviewText: text || null, wouldRecommend: rec,
        mentorQualityRating: rating,
      });
    }
    // Aisha (Frontend lead) — 4 reviews.
    await review(byLocal("mentee.maya"), aisha, 5, dims(5, 5, 5, 5), "Aisha pushes me with stretch goals and always replies fast. Best mentor I've had.", true);
    await review(byLocal("mentee.leo"), aisha, 4.5, dims(4, 5, 5, 4), "Explains tricky React concepts really clearly.", true);
    await review(byLocal("mentee.tom"), aisha, 4, dims(4, 4, 4, 5), "Patient with beginners — never makes you feel behind.", true);
    await review(byLocal("mentee.sara"), aisha, 4, dims(3, 4, 4, 5), null, true);
    // Omar (Backend lead) — 4 reviews.
    await review(byLocal("mentee.noor"), omar, 5, dims(5, 5, 4, 5), "Omar gets that life happens. Practical, honest, and breaks big problems down.", true);
    await review(byLocal("mentee.priya"), omar, 4.5, dims(5, 4, 5, 4), "Fast, detailed code review. I learn something every time.", true);
    await review(byLocal("mentee.ivan"), omar, 4, dims(4, 4, 4, 4), "Solid backend depth and good with deadlines.", true);
    await review(byLocal("mentee.jack"), omar, 3.5, dims(4, 3, 4, 4), null, true);
    console.log("✅ Mentor feedback created (Aisha ×4, Omar ×4 — above the reveal gate)\n");
  }

  // ── Daily activity logs (drive streaks / activity heat) ───────────────────────
  if (models.DailyLogEntry) {
    console.log("🔥 Seeding daily activity logs…");
    for (const m of menteeList) {
      const st = MENTEE_STATS[m.spec.archetype] || MENTEE_STATS.average;
      const streak = st.streak || 0;
      for (let i = 0; i < streak && i < 21; i++) {
        const d = daysAgo(i);
        await models.DailyLogEntry.create({
          menteeId: m.user.id, dateKey: ymd(d),
          note: i === 0 ? "Logged today's progress." : null, loggedAt: d,
        });
      }
    }
    console.log("✅ Daily activity logs created (per-mentee streaks)\n");
  }

  // ── Gamification — badges, points history & leaderboard ───────────────────────
  if (models.Badge && models.UserBadge && models.PointsHistory) {
    console.log("🏅 Seeding badges, points history & leaderboard…");
    const BADGES = [
      { name: "First Steps", description: "Completed your first task.", category: "milestone", criteriaType: "tasks_completed", criteriaValue: { count: 1 }, pointsReward: 20 },
      { name: "On Fire", description: "Reached a 7-day streak.", category: "streak", criteriaType: "streak_days", criteriaValue: { days: 7 }, pointsReward: 50 },
      { name: "Halfway Hero", description: "Crossed 50% program progress.", category: "progress", criteriaType: "progress_pct", criteriaValue: { pct: 50 }, pointsReward: 75 },
      { name: "Peer Helper", description: "Helped peers in the community.", category: "community", criteriaType: "community_kudos", criteriaValue: { count: 1 }, pointsReward: 40 },
    ];
    const badgeByName = {};
    for (const b of BADGES) {
      const [row] = await models.Badge.findOrCreate({ where: { name: b.name }, defaults: b });
      badgeByName[b.name] = row;
    }
    const award = async (user, names) => {
      for (const n of names) {
        const b = badgeByName[n];
        if (b) await models.UserBadge.create({ userId: user.id, badgeId: b.id, unlockedAt: daysAgo(3) });
      }
    };
    // Award by archetype, and lay down a couple of points-history rows each.
    for (const m of menteeList) {
      const st = MENTEE_STATS[m.spec.archetype] || MENTEE_STATS.average;
      const earned = [];
      if (st.tasks >= 1) earned.push("First Steps");
      if (st.streak >= 7) earned.push("On Fire");
      if ((m.spec.archetype === "star") || (m.spec.archetype === "on_track")) earned.push("Halfway Hero");
      if (m.spec.archetype === "star") earned.push("Peer Helper");
      await award(m.user, earned);
      // Points history — a small ledger so the points page isn't blank.
      let running = 0;
      const events = [];
      if (st.tasks >= 1) events.push({ change: 10, reason: "Completed “Semantic HTML & accessible layout”", ago: 30 });
      if (st.tasks >= 2) events.push({ change: 12, reason: "Completed “Modern CSS & responsive design”", ago: 16 });
      if (st.streak >= 7) events.push({ change: 50, reason: "Earned the On Fire badge", ago: 5 });
      for (const e of events) {
        const before = running; running += e.change;
        await models.PointsHistory.create({
          userId: m.user.id, pointsChange: e.change, pointsBefore: before, pointsAfter: running,
          sourceType: "task", reason: e.reason, createdAt: daysAgo(e.ago), updatedAt: daysAgo(e.ago),
        });
      }
    }
    // Program leaderboard (all-time), ranked by the points we set on profiles.
    if (models.LeaderboardEntry) {
      const ranked = [...menteeList]
        .map((m) => ({ user: m.user, points: (MENTEE_STATS[m.spec.archetype] || MENTEE_STATS.average).points }))
        .sort((a, b) => b.points - a.points);
      for (let i = 0; i < ranked.length; i++) {
        await models.LeaderboardEntry.create({
          userId: ranked[i].user.id, programId: program.id, rank: i + 1, points: ranked[i].points,
          periodType: "all_time", periodStart: ymd(daysAgo(7 * 7)), periodEnd: ymd(new Date()),
        });
      }
    }
    console.log("✅ Badges, points history & leaderboard created\n");
  }

  // ── Roadmap chaining — a follow-on roadmap linked after the core one ──────────
  if (models.RoadmapLink) {
    console.log("🔗 Seeding roadmap chaining…");
    const advanced = await models.Roadmap.create({
      programId: program.id, name: "Advanced Patterns & Deployment",
      description: "The follow-on track after the core roadmap: testing, CI/CD and shipping to production.",
      isBaseRoadmap: false, source: "org", published: true, totalWeeks: 4, totalTasks: 3,
      skillTags: ["testing", "ci/cd", "docker", "deployment"],
    });
    const advTasks = [
      { title: "Testing with Jest & React Testing Library", type: "project", difficulty: "medium" },
      { title: "CI/CD pipeline with GitHub Actions", type: "practical", difficulty: "hard" },
      { title: "Containerize & deploy with Docker", type: "project", difficulty: "hard" },
    ];
    for (let i = 0; i < advTasks.length; i++) {
      await models.RoadmapTask.create({
        roadmapId: advanced.id, title: advTasks[i].title,
        description: `${advTasks[i].title}. Build, then submit for mentor review.`,
        type: advTasks[i].type, difficulty: advTasks[i].difficulty, taskOrder: i + 1,
        deliverable: "Implementation passing all requirements.",
        estimatedHours: 10, pointsBase: 14 + i * 2,
      });
    }
    await models.RoadmapLink.create({ fromRoadmapId: roadmap.id, toRoadmapId: advanced.id, position: 0, createdBy: admin.id });
    console.log("✅ Roadmap chaining created (Core → Advanced Patterns)\n");
  }

  // ── A sample bug report (admin feedback inbox) ────────────────────────────────
  if (models.FeedbackReport) {
    await models.FeedbackReport.create({
      reporterId: byLocal("mentee.ivan").id, reporterRole: "mentee", type: "bug",
      title: "Task deadline shows the wrong day on mobile",
      description: "On my phone the due date is a day behind what the web shows. Might be a timezone thing.",
      status: "open", priority: "normal", pageUrl: "/mentee/tasks",
    });
    console.log("✅ Sample bug report created (admin feedback inbox)\n");
  }


  // ════════════════════════════════════════════════════════════════════════════
  //  Assessable work, the library, and the everyday furniture
  //
  //  These screens had nothing behind them, so a tester opening a quiz, an
  //  interview, the library or the rewards shelf saw an empty state and could
  //  not tell a missing feature from missing data. Everything below is scoped
  //  to demo users / the demo program and torn down by cleanupDemo().
  // ════════════════════════════════════════════════════════════════════════════

  // ── Everyone gets settings, which is where a timezone lives ──────────────────
  // The streak is counted in the mentee's own calendar day, read from here. An
  // account with no settings row falls back to UTC and would drift for anybody
  // testing from a non-UTC zone, which is everybody.
  if (models.UserSettings) {
    console.log("⚙️  Seeding user settings (timezones)…");
    const everyone = [admin, aisha, omar, sam, ...menteeList.map((m) => m.user)];
    for (const person of everyone) {
      await models.UserSettings.findOrCreate({
        where: { userId: person.id },
        defaults: { userId: person.id, timezone: TZ, language: "en" },
      });
    }
    console.log(`✅ Settings for ${everyone.length} accounts (timezone ${TZ})\n`);
  }

  // ── The library ──────────────────────────────────────────────────────────────
  // One item in every category, a pinned one at the top, and a mix of written
  // articles and outside links, because those render differently.
  if (models.Document) {
    console.log("📖 Seeding the library…");
    const LIBRARY = [
      {
        title: "How to give feedback that gets acted on",
        category: "guidance",
        summary: "The difference between a review somebody argues with and one they act on is usually the first sentence.",
        content: "<p>Start with what the work does well, and be specific about it. \"Good job\" is not feedback.</p><p>Then name one thing to change, and say why it matters to the person reading it rather than to you.</p><p>Finish with what happens next. A review that ends without a next step leaves somebody staring at a screen.</p>",
        author: "Aisha Khan", readMins: 4, pinned: true,
      },
      {
        title: "Your first two weeks",
        category: "guidance",
        summary: "What to expect, who to talk to, and what nobody tells you on day one.",
        content: "<p>Log your day even when the day went badly. The log is not a report card, it is how your mentor knows where you are.</p><p>Say you are stuck early. A blocker raised on Monday costs an hour. The same blocker raised on Friday costs a week.</p>",
        author: "Pathment", readMins: 6,
      },
      {
        title: "Refactoring UI",
        category: "reading",
        summary: "The design book for people who do not think of themselves as designers.",
        url: "https://www.refactoringui.com/", author: "Adam Wathan & Steve Schoger", readMins: 12,
      },
      {
        title: "The Twelve-Factor App",
        category: "reading",
        summary: "Still the clearest description of what a deployable service looks like.",
        url: "https://12factor.net/", author: "Adam Wiggins", readMins: 20,
      },
      {
        title: "Pull request template",
        category: "template",
        summary: "What to write so a reviewer can start reading code instead of guessing at it.",
        content: "<p><strong>What this changes</strong><br/>One sentence.</p><p><strong>Why</strong><br/>The problem, not the solution.</p><p><strong>How to check it</strong><br/>The steps somebody else would take.</p><p><strong>What I am unsure about</strong><br/>Say it here rather than hoping nobody asks.</p>",
        author: "Omar Farooq", readMins: 2,
      },
      {
        title: "The MERN stack, end to end",
        category: "guidance",
        summary: "How MongoDB, Express, React and Node actually fit together — and where each one stops.",
        content: "<p>React owns what the user sees and nothing else. The moment it knows about your database schema, you have coupled two things that change for different reasons.</p><p>Express owns the boundary: validation, auth, shaping. Business rules live behind it in services, not in route handlers.</p><p>Mongo is not a relational database with a different accent. Model for how you read, not for how the data looks on a whiteboard.</p>",
        author: "Aisha Khan", readMins: 8, pinned: true,
      },
      {
        title: "Mongoose schema design: the four mistakes",
        category: "guidance",
        summary: "Embedding when you should reference, referencing when you should embed, and the two index errors after that.",
        content: "<p><strong>1. Embedding unbounded arrays.</strong> Comments inside a post document works until a post gets 4,000 comments and every read drags them along.</p><p><strong>2. Referencing what you always read together.</strong> Two round trips to render one card is a schema problem, not a caching problem.</p><p><strong>3. No compound index for your commonest query.</strong> Run explain(). If it says COLLSCAN, you have found this week's work.</p><p><strong>4. Indexing everything.</strong> Every index is a write you pay for forever.</p>",
        author: "Omar Farooq", readMins: 9,
      },
      {
        title: "React hooks: the rules and why they exist",
        category: "reading",
        summary: "Not just what the linter shouts about, but the reason the rule is there.",
        url: "https://react.dev/reference/rules/rules-of-hooks", author: "React docs", readMins: 10,
      },
      {
        title: "MongoDB aggregation pipeline reference",
        category: "reading",
        summary: "The stages you will actually use, in the order you will actually use them.",
        url: "https://www.mongodb.com/docs/manual/core/aggregation-pipeline/", author: "MongoDB", readMins: 25,
      },
      {
        title: "JWT handbook: what a token can and cannot do for you",
        category: "reading",
        summary: "Read this before you build auth, not after your first incident.",
        url: "https://auth0.com/resources/ebooks/jwt-handbook", author: "Auth0", readMins: 30,
      },
      {
        title: "Capstone project brief",
        category: "template",
        summary: "The shape of a capstone that is worth putting on a CV.",
        content: "<p><strong>The problem</strong><br/>One paragraph. Who has it, and what they do today instead.</p><p><strong>The data model</strong><br/>Your collections, your relationships, and one sentence per index explaining why it exists.</p><p><strong>The API</strong><br/>Endpoints, auth rules, and the error envelope.</p><p><strong>What you will NOT build</strong><br/>Scope you deliberately cut. This section is the one reviewers respect most.</p><p><strong>How to run it</strong><br/>Clone, install, seed, start. If somebody cannot do it in four commands, keep working.</p>",
        author: "Aisha Khan", readMins: 5,
      },
      {
        title: "Weekly check-in template",
        category: "template",
        summary: "Fifteen minutes of writing that makes your 1:1 worth having.",
        content: "<p><strong>Shipped this week</strong> — links, not adjectives.</p><p><strong>Stuck on</strong> — what you tried, and what happened.</p><p><strong>Next week</strong> — one commitment, not five.</p><p><strong>How I am doing</strong> — honestly. Your mentor cannot help with what they cannot see.</p>",
        author: "Pathment", readMins: 2,
      },
      {
        title: "Deployment checklist",
        category: "template",
        summary: "What to confirm before you tell anyone the URL.",
        content: "<p>Secrets in environment variables, not in the repo. Check the git history too.</p><p>A health endpoint that touches the database, not one that returns 200 unconditionally.</p><p>Migrations run before the new code starts, and you have practised the rollback at least once.</p><p>Logs you could debug from at 2am: structured, with a request id.</p>",
        author: "Omar Farooq", readMins: 4,
      },
      {
        title: "Code of conduct",
        category: "policy",
        summary: "What is expected of everybody here, and what happens when it is not met.",
        content: "<p>Assume good faith. Ask before you assume.</p><p>Nobody is asked to be available outside their own working hours.</p><p>Report anything that does not sit right to an admin. It will be taken seriously and handled privately.</p>",
        author: "Pathment", readMins: 3,
      },
    ];

    for (const item of LIBRARY) {
      await models.Document.create({ ...item, createdBy: admin.id, pinned: item.pinned === true });
    }
    console.log(`✅ Library: ${LIBRARY.length} items across guidance / reading / template / policy\n`);
  }

  // ── A quiz kit, assigned, taken and graded ───────────────────────────────────
  // All four question kinds, because each renders and grades differently, and
  // the pass mark is set so the seeded attempt sits comfortably above it.
  let quizKit = null;
  if (models.QuizKit && models.QuizQuestion) {
    console.log("📝 Seeding a quiz kit…");
    quizKit = await models.QuizKit.create({
      title: "JavaScript fundamentals check",
      description: "A short check on the parts of the language people most often get wrong. Twenty minutes, one attempt.",
      createdBy: aisha.id, programId: program.id,
      timeLimitSeconds: 20 * 60, passScore: 60,
      shuffleQuestions: false, showAnswers: true, allowRetakeDefault: false,
      evaluationDefault: "auto", status: "published",
    });

    const QUESTIONS = [
      {
        kind: "single", points: 5,
        prompt: "What does `typeof null` return?",
        options: [
          { id: "a", label: "\"null\"" }, { id: "b", label: "\"object\"" },
          { id: "c", label: "\"undefined\"" }, { id: "d", label: "It throws" },
        ],
        correctOptionIds: ["b"],
        explanation: "A bug from the first version of JavaScript that can never be fixed without breaking the web.",
      },
      {
        kind: "multi", points: 10,
        prompt: "Which of these create a new array rather than changing the one you have?",
        options: [
          { id: "a", label: "map" }, { id: "b", label: "sort" },
          { id: "c", label: "filter" }, { id: "d", label: "push" },
        ],
        correctOptionIds: ["a", "c"],
        explanation: "sort and push change the array in place, which is the source of a great many surprises.",
      },
      {
        kind: "boolean", points: 5,
        prompt: "`const` means the value cannot change.",
        options: [{ id: "true", label: "True" }, { id: "false", label: "False" }],
        correctOptionIds: ["false"],
        explanation: "It means the binding cannot be reassigned. The object it points at is as mutable as ever.",
      },
      {
        kind: "short", points: 10, matchMode: "keyword",
        prompt: "In one line: why does `await` only work inside an async function?",
        acceptedAnswers: ["async"],
        explanation: "Anything mentioning that await needs an async context to suspend in.",
      },
      {
        kind: "single", points: 5,
        prompt: "Which comparison is true?",
        options: [
          { id: "a", label: "'1' === 1" }, { id: "b", label: "NaN === NaN" },
          { id: "c", label: "[] == false" }, { id: "d", label: "null === undefined" },
        ],
        correctOptionIds: ["c"],
        explanation: "Loose equality coerces the empty array to an empty string and then to 0.",
      },
      {
        kind: "short", points: 5, matchMode: "exact",
        prompt: "What array method turns [[1,2],[3]] into [1,2,3]?",
        acceptedAnswers: ["flat", "flat()", ".flat()"],
        explanation: "flat, or flatMap when you are mapping at the same time.",
      },
    ];

    const quizQuestions = [];
    for (let i = 0; i < QUESTIONS.length; i++) {
      quizQuestions.push(await models.QuizQuestion.create({
        kitId: quizKit.id, position: i, required: true,
        options: [], correctOptionIds: [], acceptedAnswers: [], matchMode: "exact",
        ...QUESTIONS[i],
      }));
    }
    console.log(`✅ Quiz kit "${quizKit.title}" with ${quizQuestions.length} questions (single / multi / boolean / short)\n`);

    // Give it to two mentees in different states, so both sides are testable:
    // one that has been taken and graded, and one still waiting to be opened.
    if (models.QuizAssignment) {
      console.log("📝 Assigning the quiz…");
      const quizStep = await models.RoadmapTask.create({
        roadmapId: null, title: "JavaScript fundamentals check", type: "quiz", difficulty: "easy",
        taskOrder: 90, description: "A short check before we move on to the framework work.",
        deliverable: "Complete the quiz.", estimatedHours: 1, isCustomTask: true, pointsBase: 40,
      });

      async function assignQuiz(target, { taken }) {
        const task = await models.AssignedTask.create({
          roadmapTaskId: quizStep.id, menteeId: target.user.id, mentorId: target.mentor.id,
          enrollmentId: target.enrollmentId, isCustomTask: true,
          status: taken ? "completed" : "assigned",
          assignedAt: daysAgo(6), dueDate: daysAhead(taken ? -1 : 4),
          startedAt: taken ? daysAgo(2) : null,
          submittedAt: taken ? daysAgo(2) : null,
          completedAt: taken ? daysAgo(2) : null,
          pointsAwarded: taken ? 40 : 0,
        });

        const assignment = await models.QuizAssignment.create({
          assignedTaskId: task.id, kitId: quizKit.id,
          evaluationMode: "auto", allowRetake: false,
          timeLimitSeconds: quizKit.timeLimitSeconds, shuffleQuestions: false,
          showAnswers: true, passScore: quizKit.passScore,
        });

        if (!taken || !models.QuizSession || !models.QuizAnswer) return task;

        // A real attempt: five of six right, so the result screen has both a
        // green run and one wrong answer with its explanation to show.
        const maxScore = quizQuestions.reduce((sum, q) => sum + q.points, 0);
        const wrongAt = 4;
        const autoScore = maxScore - quizQuestions[wrongAt].points;

        const session = await models.QuizSession.create({
          assignedTaskId: task.id, quizAssignmentId: assignment.id, menteeId: target.user.id,
          attemptNumber: 1, status: "submitted",
          startedAt: daysAgo(2), submittedAt: daysAgo(2),
          currentPosition: quizQuestions.length,
          autoScore, maxScore, scorePercent: Math.round((autoScore / maxScore) * 100),
          passed: true,
        });

        for (let i = 0; i < quizQuestions.length; i++) {
          const q = quizQuestions[i];
          const right = i !== wrongAt;
          await models.QuizAnswer.create({
            sessionId: session.id, questionId: q.id, position: i, kind: q.kind,
            promptSnapshot: q.prompt, pointsPossible: q.points,
            selectedOptionIds: q.kind === "short" ? [] : (right ? q.correctOptionIds : ["a"]),
            answerText: q.kind === "short" ? (right ? q.acceptedAnswers[0] : "not sure") : null,
            isCorrect: right, autoPoints: right ? q.points : 0, pointsAwarded: right ? q.points : 0,
          });
        }

        return task;
      }

      const quizTaker = menteeList.find((m) => m.spec.local === "mentee.maya") ?? menteeList[0];
      const quizWaiting = menteeList.find((m) => m.spec.local === "mentee.noor") ?? menteeList[1];
      await assignQuiz(quizTaker, { taken: true });
      await assignQuiz(quizWaiting, { taken: false });
      console.log("✅ Quiz assigned: one graded attempt (5 of 6 right) + one waiting to be opened\n");
    }

    // Two more published kits so the mentor's quiz library isn't a single row —
    // a walkthrough should show a shelf, not one book.
    const EXTRA_QUIZ_KITS = [
      {
        title: "React & hooks check",
        description: "Rendering, state and the rules of hooks. Twenty-five minutes, one attempt.",
        timeLimitSeconds: 25 * 60, passScore: 65,
        questions: [
          {
            kind: "single", points: 5,
            prompt: "When does a `useEffect` with an empty dependency array run?",
            options: [
              { id: "a", label: "On every render" }, { id: "b", label: "Once after the first render" },
              { id: "c", label: "Only when props change" }, { id: "d", label: "Before the first render" },
            ],
            correctOptionIds: ["b"],
            explanation: "An empty array means it has no dependencies to react to, so it runs once after mount.",
          },
          {
            kind: "multi", points: 10,
            prompt: "Which of these will cause an unnecessary re-render?",
            options: [
              { id: "a", label: "Passing a new object literal as a prop each render" },
              { id: "b", label: "Passing a stable primitive" },
              { id: "c", label: "Defining a function inline and passing it to a memoized child" },
              { id: "d", label: "Reading from a ref" },
            ],
            correctOptionIds: ["a", "c"],
            explanation: "New object and function identities defeat memoization, because the child sees a different prop every time.",
          },
          {
            kind: "boolean", points: 5,
            prompt: "You may call a hook inside an `if` block as long as the condition is stable.",
            options: [{ id: "true", label: "True" }, { id: "false", label: "False" }],
            correctOptionIds: ["false"],
            explanation: "Hooks are matched by call order. A conditional call breaks that order even if the condition rarely changes.",
          },
          {
            kind: "short", points: 10, matchMode: "keyword",
            prompt: "Name the hook you would reach for to keep a value between renders WITHOUT causing a re-render when it changes.",
            acceptedAnswers: ["useRef", "ref"],
            explanation: "useRef gives you a mutable box whose changes are invisible to the render cycle.",
          },
        ],
      },
      {
        title: "MongoDB & data modelling check",
        description: "Schemas, indexes and aggregation. Thirty minutes, one attempt.",
        timeLimitSeconds: 30 * 60, passScore: 60,
        questions: [
          {
            kind: "single", points: 5,
            prompt: "You always render a post together with its author's name. What is usually the right call?",
            options: [
              { id: "a", label: "Reference the author and populate on every read" },
              { id: "b", label: "Embed the author's name on the post" },
              { id: "c", label: "Duplicate the whole author document" },
              { id: "d", label: "Use a join collection" },
            ],
            correctOptionIds: ["b"],
            explanation: "Model for how you read. Embedding the small piece you always need beats a second round trip.",
          },
          {
            kind: "multi", points: 10,
            prompt: "Which are real costs of adding an index?",
            options: [
              { id: "a", label: "Slower writes" }, { id: "b", label: "Slower reads on that field" },
              { id: "c", label: "More storage" }, { id: "d", label: "More memory held resident" },
            ],
            correctOptionIds: ["a", "c", "d"],
            explanation: "Indexes buy read speed and are paid for on every write, in storage and in RAM.",
          },
          {
            kind: "boolean", points: 5,
            prompt: "`$match` should be placed as early as possible in an aggregation pipeline.",
            options: [{ id: "true", label: "True" }, { id: "false", label: "False" }],
            correctOptionIds: ["true"],
            explanation: "Filter first so every later stage does less work — and an early $match can use an index.",
          },
          {
            kind: "short", points: 10, matchMode: "keyword",
            prompt: "Which method shows you whether a query used an index or scanned the collection?",
            acceptedAnswers: ["explain", "explain()"],
            explanation: "explain() is the difference between guessing about performance and knowing.",
          },
        ],
      },
    ];

    for (const kit of EXTRA_QUIZ_KITS) {
      const created = await models.QuizKit.create({
        title: kit.title, description: kit.description,
        createdBy: aisha.id, programId: program.id,
        timeLimitSeconds: kit.timeLimitSeconds, passScore: kit.passScore,
        shuffleQuestions: false, showAnswers: true, allowRetakeDefault: false,
        evaluationDefault: "auto", status: "published",
      });
      for (let i = 0; i < kit.questions.length; i++) {
        const q = kit.questions[i];
        await models.QuizQuestion.create({
          kitId: created.id, position: i, required: true,
          options: [], correctOptionIds: [], acceptedAnswers: [], matchMode: "exact",
          ...q,
        });
      }
    }
    console.log(`✅ ${EXTRA_QUIZ_KITS.length} more quiz kits published (React, MongoDB)\n`);
  }

  // ── An interview kit, assigned, sat and awaiting review ──────────────────────
  if (models.InterviewKit && models.InterviewQuestion) {
    console.log("🎤 Seeding an interview kit…");
    const interviewKit = await models.InterviewKit.create({
      title: "Mid-level full stack screen",
      description: "Four questions: how you explain your work, how you write it, and how you reason about a system you cannot see.",
      createdBy: omar.id, programId: program.id,
      timingMode: "per_question", cameraDefault: false,
      aiGradingDefault: true, allowRetakeDefault: false, status: "published",
    });

    const IQ = [
      {
        kind: "voice", points: 10, timeLimitSeconds: 180,
        prompt: "Walk me through something you have built that you are proud of. What was hard about it?",
        referenceAnswer: "Looking for a specific project, a real constraint, and what they would do differently. Vague answers about teamwork score low.",
      },
      {
        kind: "code", points: 20, timeLimitSeconds: 900, codeLanguage: "javascript",
        prompt: "Write a function that takes a list of tasks and returns the longest run of consecutive days that has at least one completed task.",
        starterCode: "function longestStreak(tasks) {\n  // tasks: [{ completedAt: '2026-08-14' }]\n}\n",
        referenceAnswer: "A set of day keys and a walk backwards from today. Full marks need the empty list handled and duplicate days counted once.",
      },
      {
        kind: "text", points: 15, timeLimitSeconds: 480,
        prompt: "A page in production takes eight seconds to load. You cannot reproduce it locally. What do you do first, and why that first?",
        referenceAnswer: "Should start by measuring rather than guessing: real user timings, then narrowing to network, server or render before touching any code.",
      },
      {
        kind: "voice", points: 10, timeLimitSeconds: 120,
        prompt: "Tell me about a time you disagreed with a review. How did it end?",
        referenceAnswer: "Looking for somebody who can hold a position and also change it. Either extreme is a flag.",
      },
    ];

    const iQuestions = [];
    for (let i = 0; i < IQ.length; i++) {
      iQuestions.push(await models.InterviewQuestion.create({
        kitId: interviewKit.id, position: i, required: true, ...IQ[i],
      }));
    }
    console.log(`✅ Interview kit "${interviewKit.title}" with ${iQuestions.length} questions (voice / code / text)\n`);

    // A second, MERN-specific kit so the interview library shows a shelf too.
    const reactKit = await models.InterviewKit.create({
      title: "React & MERN technical screen",
      description: "Four questions on the stack itself: state, data modelling, auth and a system you have to reason about out loud.",
      createdBy: aisha.id, programId: program.id,
      timingMode: "per_question", cameraDefault: false,
      aiGradingDefault: true, allowRetakeDefault: false, status: "published",
    });
    const REACT_IQ = [
      {
        kind: "voice", points: 10, timeLimitSeconds: 180,
        prompt: "Explain the difference between local state, lifted state and global state — and how you decide which one a piece of data belongs in.",
        referenceAnswer: "Looking for: start local, lift only when two siblings need it, reach for global only when it is genuinely app-wide. A candidate who reaches for Redux first has not thought about it.",
      },
      {
        kind: "code", points: 15, timeLimitSeconds: 900,
        prompt: "This component refetches on every keystroke and floods the API. Fix it, and explain what your fix does when the user types quickly then deletes everything.",
        starterCode: "function Search() {\n  const [q, setQ] = useState('');\n  const [results, setResults] = useState([]);\n\n  useEffect(() => {\n    fetch(`/api/search?q=${q}`)\n      .then((r) => r.json())\n      .then(setResults);\n  });\n\n  return <input value={q} onChange={(e) => setQ(e.target.value)} />;\n}",
        referenceAnswer: "Missing dependency array plus no debounce and no cancellation. A strong answer handles the out-of-order response too — an earlier slow request landing after a later fast one.",
      },
      {
        kind: "code", points: 15, timeLimitSeconds: 600,
        prompt: "Model a 'course with lessons and student progress' in Mongoose. Say which parts you embed, which you reference, and which indexes you add.",
        starterCode: "// Sketch the schemas. Comments explaining the trade-offs count for as much as the code.",
        referenceAnswer: "Lessons embedded in a course is defensible (bounded, always read together). Progress must be its own collection keyed on (studentId, courseId) — it is unbounded and written constantly.",
      },
      {
        kind: "text", points: 10, timeLimitSeconds: 420,
        prompt: "Your API returns 401 for an expired access token. Describe what the frontend should do — and what it should NOT do.",
        referenceAnswer: "Should: refresh once, single-flight, replay the request. Should not: log the user out on any failed refresh, which is the mistake that boots people mid-session on a flaky network.",
      },
    ];
    for (let i = 0; i < REACT_IQ.length; i++) {
      await models.InterviewQuestion.create({ kitId: reactKit.id, position: i, required: true, ...REACT_IQ[i] });
    }
    console.log(`✅ Interview kit "${reactKit.title}" with ${REACT_IQ.length} questions\n`);

    if (models.InterviewAssignment) {
      console.log("🎤 Assigning the interview…");
      const interviewStep = await models.RoadmapTask.create({
        roadmapId: null, title: "Mid-level full stack screen", type: "interview", difficulty: "hard",
        taskOrder: 91, description: "A practice screen under real conditions. Timed, one attempt.",
        deliverable: "Sit the interview.", estimatedHours: 1, isCustomTask: true, pointsBase: 55,
      });

      async function assignInterview(target, { sat }) {
        const task = await models.AssignedTask.create({
          roadmapTaskId: interviewStep.id, menteeId: target.user.id, mentorId: target.mentor.id,
          enrollmentId: target.enrollmentId, isCustomTask: true,
          status: sat ? "submitted" : "assigned",
          assignedAt: daysAgo(5), dueDate: daysAhead(sat ? -1 : 6),
          startedAt: sat ? daysAgo(1) : null,
          submittedAt: sat ? daysAgo(1) : null,
        });

        const assignment = await models.InterviewAssignment.create({
          assignedTaskId: task.id, kitId: interviewKit.id,
          allowRetake: false, cameraRequired: false, aiGradingEnabled: true,
          timingMode: "per_question",
        });

        if (!sat || !models.InterviewSession || !models.InterviewAnswer) return task;

        // Sat and submitted, waiting on a mentor. This is what makes the
        // interview review screen worth opening.
        const session = await models.InterviewSession.create({
          assignedTaskId: task.id, interviewAssignmentId: assignment.id, menteeId: target.user.id,
          attemptNumber: 1, status: "submitted",
          startedAt: daysAgo(1), submittedAt: daysAgo(1),
          currentPosition: iQuestions.length,
        });

        const ANSWERS = [
          "I built the scheduling piece for a small clinic. The hard part was not the calendar, it was two receptionists booking the same slot at the same moment. I ended up locking on the slot row rather than trusting the check I had written above it.",
          null,
          "First I would look at real user timings rather than my own machine, because eight seconds for them and two for me is the whole problem. Once I know whether it is network, server or render, I have one place to look instead of three. Guessing at a fix before that is how you spend a day making something faster that was never slow.",
          "A reviewer wanted me to split a function I thought was fine. I pushed back once, they explained it was about the test being unreadable rather than the function, and they were right. I split it.",
        ];

        for (let i = 0; i < iQuestions.length; i++) {
          const q = iQuestions[i];
          await models.InterviewAnswer.create({
            sessionId: session.id, questionId: q.id, position: i, kind: q.kind,
            promptSnapshot: q.prompt, pointsPossible: q.points,
            transcript: q.kind === "voice" ? ANSWERS[i] : null,
            code: q.kind === "code"
              ? "function longestStreak(tasks) {\n  const days = new Set(tasks.map((t) => t.completedAt.slice(0, 10)));\n  let best = 0;\n  for (const day of days) {\n    let run = 1;\n    let cursor = new Date(day);\n    while (true) {\n      cursor.setDate(cursor.getDate() - 1);\n      const key = cursor.toISOString().slice(0, 10);\n      if (!days.has(key)) break;\n      run += 1;\n    }\n    best = Math.max(best, run);\n  }\n  return best;\n}"
              : null,
            codeLanguage: q.kind === "code" ? "javascript" : null,
            answerText: q.kind === "text" ? ANSWERS[i] : null,
          });
        }

        return task;
      }

      const sitter = menteeList.find((m) => m.spec.local === "mentee.priya") ?? menteeList[0];
      const upcoming = menteeList.find((m) => m.spec.local === "mentee.ivan") ?? menteeList[1];
      await assignInterview(sitter, { sat: true });
      await assignInterview(upcoming, { sat: false });
      console.log("✅ Interview assigned: one sat and awaiting review + one still to sit\n");
    }
  }

  // ── The rewards shelf ────────────────────────────────────────────────────────
  if (models.Gift) {
    console.log("🎁 Seeding rewards…");
    const GIFTS = [
      { name: "One hour of 1:1 time", description: "A dedicated session with a mentor of your choosing, on whatever you want.", costXp: 300, stock: null },
      { name: "Course of your choice", description: "Any single paid course up to fifty pounds, expensed.", costXp: 900, stock: 5 },
      { name: "Pathment hoodie", description: "The good kind, not the conference kind.", costXp: 1200, stock: 12 },
      { name: "CV and portfolio review", description: "A written review from a mentor who hires, turned around inside a week.", costXp: 500, stock: null },
      { name: "Retired: sticker pack", description: "No longer available.", costXp: 100, stock: 0, active: false },
    ];

    const gifts = [];
    for (const gift of GIFTS) {
      gifts.push(await models.Gift.create({ ...gift, active: gift.active !== false, createdBy: admin.id }));
    }

    if (models.Redemption) {
      const maya = byLocal("mentee.maya");
      await models.Redemption.create({ giftId: gifts[0].id, menteeId: maya.id, redeemedBy: admin.id, costXp: gifts[0].costXp });
      await models.Redemption.create({ giftId: gifts[3].id, menteeId: byLocal("mentee.ivan").id, costXp: gifts[3].costXp });
    }
    console.log(`✅ Rewards: ${GIFTS.length} gifts (one retired) + 2 redemptions\n`);
  }

  // ── Personal tracks (lanes a mentee organises their own work into) ───────────
  if (models.Track) {
    console.log("🛤️  Seeding personal tracks…");
    let made = 0;
    for (const m of menteeList.slice(0, 3)) {
      const lanes = [
        { name: "Programme", color: "#006963", origin: "program", orderIndex: 0 },
        { name: "Side project", color: "#8A6A2F", origin: "blank", orderIndex: 1 },
        { name: "Interview prep", color: "#3D5A8A", origin: "blank", orderIndex: 2 },
      ];
      for (const lane of lanes) {
        await models.Track.create({ ...lane, menteeId: m.user.id, createdBy: m.user.id });
        made += 1;
      }
    }
    console.log(`✅ ${made} personal tracks across 3 mentees\n`);
  }

  // ── Invites, in every state the admin page can show ──────────────────────────
  if (models.RegistrationInvite) {
    console.log("✉️  Seeding registration invites…");
    const crypto = require("crypto");
    const hash = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

    const INVITES = [
      { local: "pending.one", role: "mentee", expiresAt: daysAhead(5), usedAt: null, revokedAt: null },
      { local: "pending.two", role: "mentee", expiresAt: daysAhead(2), usedAt: null, revokedAt: null },
      { local: "expired.one", role: "mentee", expiresAt: daysAgo(3), usedAt: null, revokedAt: null },
      { local: "expired.two", role: "mentor", expiresAt: daysAgo(9), usedAt: null, revokedAt: null },
      { local: "revoked.one", role: "mentee", expiresAt: daysAhead(6), usedAt: null, revokedAt: daysAgo(1) },
    ];

    for (const invite of INVITES) {
      await models.RegistrationInvite.create({
        email: `${invite.local}${DEMO_DOMAIN}`,
        tokenHash: hash(`demo-${invite.local}-${Date.now()}`),
        role: invite.role, invitedBy: admin.id,
        expiresAt: invite.expiresAt, usedAt: invite.usedAt, revokedAt: invite.revokedAt,
        programId: program.id, cohortId: cohort.id,
      });
    }
    console.log(`✅ ${INVITES.length} invites (pending / expired / revoked — the expired ones exercise resend)\n`);
  }


  // ── Intake: applications in every state the admin queue can show ─────────────
  // The intake page was empty, so the whole accept / place / reject flow had
  // nothing to act on. These are deliberately spread across the decisions an
  // admin actually has to make, including the two awkward ones: somebody
  // accepted but not yet placed in a clan, and somebody sitting on a decision
  // long enough to be the oldest in the queue.
  if (models.Application) {
    console.log("📥 Seeding intake applications…");
    const APPLICANTS = [
      { first: "Hina", last: "Zafar", status: "pending", days: 9,
        note: null, score: null,
        why: "I have been building small tools at work for two years and want to do it properly." },
      { first: "Bilal", last: "Ahmed", status: "pending", days: 4,
        note: null, score: null,
        why: "Career change from mechanical engineering. I finished CS50 last month." },
      { first: "Tara", last: "Nasir", status: "assessment_sent", days: 6,
        note: "Strong written application, assessment sent Tuesday.", score: null,
        why: "I want to move from QA into building the things I currently test." },
      { first: "Ruslan", last: "Iskakov", status: "under_review", days: 5,
        note: "Good assessment. Wants evening sessions only, needs a mentor who can do that.", score: 78,
        why: "I work nights and study in the mornings. I am looking for structure more than teaching." },
      { first: "Amara", last: "Okafor", status: "accepted", days: 3,
        note: "Excellent across the board. Accepted, still needs placing in a clan.", score: 91,
        why: "I have shipped two side projects and want to learn how a real team works." },
      { first: "Deniz", last: "Yilmaz", status: "waitlisted", days: 7,
        note: "Would take them if a place opens. Held for the next cohort.", score: 66,
        why: "Self taught for a year. I know my fundamentals are patchy and I want them fixed." },
      { first: "Marcus", last: "Bell", status: "rejected", days: 11,
        note: "Not ready for this cohort. Encouraged to apply again after some practice.", score: 34,
        why: "I want to learn to code." },
    ];

    for (const person of APPLICANTS) {
      const decided = ["accepted", "rejected", "waitlisted"].includes(person.status);
      await models.Application.create({
        cohortId: cohort.id,
        email: `applicant.${person.first.toLowerCase()}${DEMO_DOMAIN}`,
        firstName: person.first, lastName: person.last,
        programPreference: program.name,
        source: "public_link",
        status: person.status,
        assessmentScore: person.score,
        assessmentSubmittedAt: person.score != null ? daysAgo(person.days - 1) : null,
        reviewerNotes: person.note,
        reviewedBy: decided || person.status === "under_review" ? admin.id : null,
        decidedAt: decided ? daysAgo(Math.max(1, person.days - 2)) : null,
        decisionReason: person.status === "rejected" ? "Not ready for this cohort yet." : null,
        responses: {
          why_join: person.why,
          hours_per_week: person.status === "rejected" ? "2" : "10",
          github: `https://github.com/${person.first.toLowerCase()}`,
        },
        createdAt: daysAgo(person.days),
      });
    }
    console.log(`✅ ${APPLICANTS.length} applications (pending / sent / under review / accepted-unplaced / waitlisted / rejected)\n`);
  }

  // ── A running challenge, with people in it ───────────────────────────────────
  if (models.Challenge) {
    console.log("🏆 Seeding a challenge…");
    const challenge = await models.Challenge.create({
      createdBy: admin.id,
      title: "Thirty days, no missed logs",
      description: "Log every day for thirty days running. Missing one resets the count, so the only way through is to actually show up.",
      type: "consistency",
      requirements: { metric: "daily_log_streak", target: 30 },
      eligibilityCriteria: { role: "mentee" },
      pointsReward: 250,
      startDate: daysAgo(12),
      endDate: daysAhead(18),
      status: "active",
    });

    if (models.UserChallenge) {
      // Spread across the states the standings screen has to draw: somebody
      // finished, somebody most of the way, somebody who just joined.
      const entrants = [
        { local: "mentee.maya", progress: 100, done: true },
        { local: "mentee.ivan", progress: 70, done: false },
        { local: "mentee.priya", progress: 40, done: false },
        { local: "mentee.noor", progress: 10, done: false },
      ];
      for (const entrant of entrants) {
        await models.UserChallenge.create({
          userId: byLocal(entrant.local).id, challengeId: challenge.id,
          progressPercentage: entrant.progress,
          isCompleted: entrant.done,
          enrolledAt: daysAgo(12),
          completedAt: entrant.done ? daysAgo(1) : null,
        });
      }
      await challenge.update({ totalParticipants: entrants.length, totalCompleted: entrants.filter((e) => e.done).length });
      console.log(`✅ Challenge "${challenge.title}" with ${entrants.length} entrants (1 finished)\n`);
    }
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🎉 Demo data ready!  All accounts use password:  " + DEMO_PASSWORD);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Admin    admin" + DEMO_DOMAIN);
  console.log("  Mentor   mentor.aisha" + DEMO_DOMAIN + "   ← START HERE (MERN Fellows, lead, 20 fellows)");
  console.log("  Mentor   mentor.sam" + DEMO_DOMAIN + "     (MERN Fellows, CO-MENTOR, analytics off)");
  console.log("  Mentor   mentor.omar" + DEMO_DOMAIN + "    (Node Guild — lead, 6 fellows)");
  console.log("  Mentee   mentee.maya" + DEMO_DOMAIN + "    (star · 21/32 steps · nominated for co-mentor)");
  console.log("  Mentee   mentee.priya" + DEMO_DOMAIN + "   (submissions awaiting review)");
  console.log("  Mentee   mentee.noor" + DEMO_DOMAIN + "    (struggling but fighting · long chat history)");
  console.log("  Mentee   mentee.sara" + DEMO_DOMAIN + "    (at risk · silent 14 days)");
  console.log("  Mentee   mentee.tom" + DEMO_DOMAIN + "     (brand new · nothing assigned yet)");
  console.log("  …and " + (MENTEE_SPECS.length - 5) + " more spanning on-track / watch / average / new");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Scale:  " + MENTEE_SPECS.length + " mentees · 20 in the hero clan · 32-step MERN roadmap");
  console.log("          16-week program, cohort is ~9 weeks in (mid-flight)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  For the video — worth opening, in this order:");
  console.log("   1 Cockpit    20 fellows, risk spread, momentum, fairness signals");
  console.log("   2 Roadmap    32 steps in 5 phases — mentees see the WHOLE map");
  console.log("   3 Review     today's round is in progress, last week's is finished");
  console.log("   4 Approvals  several submissions genuinely waiting on the mentor");
  console.log("   5 Messages   10 threads with real history (incl. mentor↔co-mentor)");
  console.log("   6 Quizzes    3 kits (JS, React, MongoDB) + a graded attempt");
  console.log("   7 Interviews 2 kits (full-stack, React/MERN) + one awaiting review");
  console.log("   8 Library    14 items across guidance / reading / template / policy");
  console.log("   9 Community  questions, kudos and a win across clan/program/global");
  console.log("  10 Analytics  clan comparison needs 2 clans — that's why Node Guild exists");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Also seeded: cohort-review sessions + attendance, 1:1 slots &");
  console.log("  meetings, notifications, anonymous mentor feedback, daily streaks,");
  console.log("  badges/points/leaderboard, roadmap chaining, rewards, invites,");
  console.log("  public clan join (join.tester pending on MERN Fellows), intake");
  console.log("  applications, a challenge, personal tracks and a bug report.");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ Demo seed failed:", err.message);
    if (err.errors) err.errors.forEach((e) => console.error("   •", e.message));
    if (err.original) console.error("   Details:", err.original.message);
    process.exit(1);
  });
