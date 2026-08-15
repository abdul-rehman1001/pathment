'use strict';

/**
 * Global Jest setup — runs after the Jest test framework is installed,
 * before each test file. Safe to use jest.mock() and jest.fn() here.
 *
 * Environment variables are loaded by tests/env.js (setupFiles) which
 * runs earlier in the Jest lifecycle.
 */

// ─── Mock notification orchestrator (email, push, in-app) ────────────────────
jest.mock('../src/services/notificationOrchestrator', () => {
  const stub = jest.fn().mockResolvedValue({ delivered: 0, skipped: 0 });
  return {
    dispatch: stub,
    sendWelcomeEmail: jest.fn().mockResolvedValue({ sent: true }),
    sendRegistrationInviteEmail: jest.fn().mockResolvedValue({ sent: true }),
    sendPasswordResetEmail: jest.fn().mockResolvedValue({ sent: true }),
    sendEmailVerificationEmail: jest.fn().mockResolvedValue({ sent: true }),
    sendSignInLinkEmail: jest.fn().mockResolvedValue({ sent: true }),
  };
});

// ─── Mock email service ───────────────────────────────────────────────────────
jest.mock('../src/services/emailService', () => ({
  sendEmail: jest.fn().mockResolvedValue({ id: 'mock-email-id' }),
  sendVerificationEmail: jest.fn().mockResolvedValue({ id: 'mock-email-id' }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ id: 'mock-email-id' }),
  sendWelcomeEmail: jest.fn().mockResolvedValue({ id: 'mock-email-id' }),
  sendInviteEmail: jest.fn().mockResolvedValue({ id: 'mock-email-id' }),
}));

// ─── Mock Groq / AI service ───────────────────────────────────────────────────
jest.mock('../src/services/groqService', () => {
  const mockRoadmap = {
    totalWeeks: 1,
    weeks: [
      {
        weekNumber: 1,
        title: 'Introduction to REST APIs',
        objectives: ['Understand REST principles', 'Implement CRUD'],
        milestone: 'Build a basic REST API',
        tasks: [
          {
            title: 'Build a basic REST API',
            description: 'Create a Node.js REST API with CRUD operations',
            type: 'project',
            difficulty: 'medium',
            estimatedHours: 5,
            taskOrder: 1,
            deliverable: 'GitHub repository link',
            objectives: [],
            resources: [],
          },
        ],
      },
    ],
  };

  const mockMatchScore = {
    mentorId: null,
    score: 80,
    breakdown: { skillMatch: 80, availabilityMatch: 80, experienceMatch: 80, styleMatch: 80 },
    reasoning: 'Mock matching score',
    strengths: ['Good skill alignment'],
    concerns: [],
  };

  const mockInstance = {
    enabled: true,
    generateRoadmap: jest.fn().mockResolvedValue(mockRoadmap),
    batchGenerateMatchingScores: jest.fn().mockImplementation((mentors) =>
      Promise.resolve(mentors.map(m => ({ ...mockMatchScore, mentorId: m.id })))
    ),
    generateMatchingScore: jest.fn().mockResolvedValue(mockMatchScore),
    determineBestLevel: jest.fn().mockResolvedValue(null),
    calculateBasicMatchScore: jest.fn().mockReturnValue({ score: 70, breakdown: {}, reasoning: '', strengths: [], concerns: [] }),
    generateAdaptiveRecommendations: jest.fn().mockResolvedValue({ recommendations: [], confidence: 0, summary: '' }),
  };

  return mockInstance;
});

// ─── Mock Cloudinary upload ───────────────────────────────────────────────────
jest.mock('../src/utils/cloudinaryUpload', () => ({
  uploadToCloudinary: jest.fn().mockResolvedValue({
    secure_url: 'https://res.cloudinary.com/test/image/upload/test.pdf',
    public_id: 'pathment/test/mock-file',
  }),
  deleteFromCloudinary: jest.fn().mockResolvedValue({ result: 'ok' }),
}));
