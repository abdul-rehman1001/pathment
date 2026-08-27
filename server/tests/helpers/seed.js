'use strict';

/**
 * Seeding helpers for tests.
 * Each helper creates a minimal valid record and returns the created instance.
 * All helpers are idempotent-by-intent — tests should truncate tables via
 * cleanDb() in afterEach/beforeEach to guarantee isolation.
 */

const bcrypt = require('bcrypt');
const { sequelize, models } = require('../../src/db');
const { generateRandomToken, hashToken, generateAccessToken } = require('../../src/utils/jwt');

// Hard stop — never allow seed helpers to run against a non-test database
const _dbUrl = process.env.DATABASE_URL || '';
if (!_dbUrl.includes('test')) {
  throw new Error(
    `SEED SAFETY: DATABASE_URL "${_dbUrl}" does not contain "test". ` +
    'Refusing to run seed helpers against a non-test database.'
  );
}

// ─── Low-level helper ─────────────────────────────────────────────────────────

/**
 * Truncate all application tables in dependency order.
 * Call in beforeEach to keep tests isolated.
 */
async function cleanDb() {
  await sequelize.query('SET session_replication_role = replica');  // disable FK checks temporarily
  const tableOrder = [
    'clan_join_requests',
    'task_feedback',
    'task_submission_files',
    'task_submissions',
    'assigned_tasks',
    'roadmap_tasks',
    'roadmap_weeks',
    'roadmaps',
    'mentor_mentee_matches',
    'enrollments',
    'level_mentor_assignments',
    'program_levels',
    'programs',
    'password_reset_tokens',
    'email_verification_tokens',
    'refresh_tokens',
    'registration_invites',
    'user_settings',
    'mentor_profiles',
    'mentee_profiles',
    'admin_profiles',
    'user_skills',
    'gamification_points',
    'notifications',
    'user_badges',
    'users',
  ];
  for (const table of tableOrder) {
    try {
      await sequelize.query(`TRUNCATE TABLE "${table}" CASCADE`);
    } catch (_) {
      // Table may not exist in a partial schema; ignore
    }
  }
  await sequelize.query('SET session_replication_role = DEFAULT');
}

// ─── User helpers ──────────────────────────────────────────────────────────────

async function createUser({ role = 'mentee', email, password = 'Test@1234', firstName = 'Test', lastName = 'User', emailVerified = true, status = 'active' } = {}) {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await models.User.create({
    email: email || `${role}-${Date.now()}@test.com`,
    passwordHash,
    role,
    firstName,
    lastName,
    emailVerified,
    emailVerifiedAt: emailVerified ? new Date() : null,
    status,
  });

  // Create role-specific profile
  if (role === 'mentor') {
    await models.MentorProfile.create({
      userId: user.id,
      specialization: [],
      yearsOfExperience: 0,
      maxMentees: 5,
    });
  } else if (role === 'mentee') {
    await models.MenteeProfile.create({
      userId: user.id,
      learningGoals: [],
      currentLevel: 1,
      totalPoints: 0,
    });
  } else if (role === 'admin') {
    await models.AdminProfile.create({ userId: user.id });
  }

  // Create user settings
  try {
    await models.UserSettings.create({ userId: user.id });
  } catch (_) {}

  return user;
}

async function createAdmin(overrides = {}) {
  return createUser({ role: 'admin', email: 'admin@ue.edu', password: 'Admin@2024', firstName: 'Admin', lastName: 'User', ...overrides });
}

async function createMentor(overrides = {}) {
  return createUser({ role: 'mentor', email: 'mentor@test.com', password: 'Mentor@1234', ...overrides });
}

async function createMentee(overrides = {}) {
  return createUser({ role: 'mentee', email: 'mentee@test.com', password: 'Mentee@1234', ...overrides });
}

// ─── Invite token helper ───────────────────────────────────────────────────────

/**
 * Creates a RegistrationInvite and returns { rawToken, invite }.
 * rawToken is what you put in the registration request body.
 */
async function createInviteToken({ adminId, role = 'mentee', email, expiresInHours = 72 } = {}) {
  const rawToken = generateRandomToken();
  const tokenHash = hashToken(rawToken);
  const invite = await models.RegistrationInvite.create({
    tokenHash,
    email: email || `invite-${Date.now()}@test.com`,
    role,
    invitedBy: adminId,
    expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
    metadata: {},
  });
  return { rawToken, invite };
}

// ─── Email verification token helper ──────────────────────────────────────────

async function createEmailVerificationToken(userId, { expired = false } = {}) {
  const rawToken = generateRandomToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = expired
    ? new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
    : new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

  await models.EmailVerificationToken.create({ userId, token: tokenHash, expiresAt });
  return rawToken; // return raw so test can send it in the request
}

// ─── Password reset token helper ──────────────────────────────────────────────

async function createPasswordResetToken(userId, { expired = false } = {}) {
  const rawToken = generateRandomToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = expired
    ? new Date(Date.now() - 60 * 60 * 1000) // 1 hour ago
    : new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

  await models.PasswordResetToken.create({ userId, token: tokenHash, expiresAt });
  return rawToken; // return raw so test can send it in the request
}

// ─── Program helpers ───────────────────────────────────────────────────────────

async function createProgram({ createdBy, name = 'Test Program', status = 'published', type = 'mentorship', totalDurationWeeks = 12 } = {}) {
  return models.Program.create({
    createdBy,
    name,
    description: 'A test program for unit testing purposes',
    type,
    status,
    totalDurationWeeks,
    startDate: '2026-06-01',
    endDate: '2026-09-01',
  });
}

async function createProgramLevel({ programId, name = 'Foundation', levelOrder = 1 } = {}) {
  return models.ProgramLevel.create({
    programId,
    name,
    levelOrder,
    durationWeeks: 4,
    description: 'Foundation level',
    learningOutcomes: [],
    prerequisites: [],
  });
}

// ─── Roadmap helpers ───────────────────────────────────────────────────────────

async function createRoadmap({ programId, levelId, createdBy } = {}) {
  return models.Roadmap.create({ programId, levelId, createdBy, name: 'Test Roadmap', description: 'Test roadmap' });
}

async function createRoadmapWeek({ roadmapId, weekNumber = 1 } = {}) {
  return models.RoadmapWeek.create({ roadmapId, weekNumber, title: 'Week theme', objectives: [] });
}

async function createRoadmapTask({ weekId, title = 'Build REST API', estimatedHours = 5, taskOrder = 1 } = {}) {
  return models.RoadmapTask.create({
    roadmapWeekId: weekId,
    title,
    description: 'Task description',
    type: 'project',
    taskOrder,
    deliverable: 'GitHub link',
    estimatedHours,
    difficulty: 'medium',
    objectives: [],
    resources: [],
  });
}

// ─── Enrollment helpers ────────────────────────────────────────────────────────

async function createEnrollment({ menteeId, programId, levelId = null, status = 'pending_match' } = {}) {
  return models.Enrollment.create({
    menteeId,
    programId,
    currentLevelId: levelId,
    status,
    currentWeek: 1,
    tasksCompleted: 0,
    tasksTotal: 0,
    overallProgressPercentage: 0,
  });
}

// ─── Task helpers ──────────────────────────────────────────────────────────────

async function createAssignedTask({ menteeId, mentorId, enrollmentId, roadmapTaskId, dueDate, status = 'assigned' } = {}) {
  return models.AssignedTask.create({
    roadmapTaskId,
    menteeId,
    mentorId,
    enrollmentId,
    status,
    dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    isLate: false,
    pointsAwarded: 0,
  });
}

// ─── JWT helper ────────────────────────────────────────────────────────────────

function tokenFor(user) {
  return generateAccessToken({ id: user.id, email: user.email, role: user.role });
}

async function createMatch({ mentorId, menteeId, enrollmentId, levelId, matchedBy, status = 'active' } = {}) {
  return models.MentorMenteeMatch.create({ mentorId, menteeId, enrollmentId, levelId, matchedBy: matchedBy || mentorId, status });
}

function authHeader(user) {
  return `Bearer ${tokenFor(user)}`;
}

module.exports = {
  cleanDb,
  createUser,
  createAdmin,
  createMentor,
  createMentee,
  createInviteToken,
  createEmailVerificationToken,
  createPasswordResetToken,
  createProgram,
  createProgramLevel,
  createRoadmap,
  createRoadmapWeek,
  createRoadmapTask,
  createEnrollment,
  createAssignedTask,
  createMatch,
  tokenFor,
  authHeader,
};
