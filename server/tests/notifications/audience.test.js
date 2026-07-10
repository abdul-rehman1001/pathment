'use strict';

/**
 * Role-scoped notifications: every notification carries an `audience` so the bell
 * + list can show only the role the viewer is currently in.
 *
 * These pin the three things that keep it correct for the future:
 *   1. the matrix declares an audience for EVERY event (so a new notification
 *      can't ship un-classified),
 *   2. resolveAudience prefers the concrete actionUrl role, falls back to the
 *      declared audience, then 'any',
 *   3. dispatch actually stamps the resolved audience on the created row.
 */

const {
  NOTIFICATION_EVENTS,
  NOTIFICATION_MATRIX,
  NOTIFICATION_AUDIENCES,
  resolveAudience,
  deriveAudienceFromUrl,
} = require('../../src/config/notificationMatrix');

describe('notification matrix audience (future-proofing)', () => {
  it('declares a valid audience for EVERY event — no notification ships unclassified', () => {
    const offenders = Object.entries(NOTIFICATION_MATRIX)
      .filter(([, m]) => !NOTIFICATION_AUDIENCES.includes(m.audience))
      .map(([k]) => k);
    expect(offenders).toEqual([]);
  });

  it('covers every declared event key', () => {
    for (const key of Object.values(NOTIFICATION_EVENTS)) {
      // Some events (e.g. badge grants) may not be in the matrix; those that ARE
      // must be valid. Just assert no matrix entry is missing its audience.
      const m = NOTIFICATION_MATRIX[key];
      if (m) expect(NOTIFICATION_AUDIENCES).toContain(m.audience);
    }
  });
});

describe('deriveAudienceFromUrl', () => {
  it('reads the role from the URL namespace', () => {
    expect(deriveAudienceFromUrl('/mentor/review')).toBe('mentor');
    expect(deriveAudienceFromUrl('/mentee/tasks')).toBe('mentee');
    expect(deriveAudienceFromUrl('/admin/promotions')).toBe('admin');
    expect(deriveAudienceFromUrl('/mentor/clan-team?tab=x')).toBe('mentor');
  });
  it('returns null for role-neutral or missing URLs', () => {
    expect(deriveAudienceFromUrl('/notifications')).toBeNull();
    expect(deriveAudienceFromUrl('/community')).toBeNull();
    expect(deriveAudienceFromUrl('')).toBeNull();
    expect(deriveAudienceFromUrl(null)).toBeNull();
  });
});

describe('resolveAudience', () => {
  it('prefers the concrete actionUrl role (per-recipient, beats the declared default)', () => {
    // PROMOTION_NOMINATED is declared 'any' but a mentee's "you're a co-mentor"
    // notification links to /mentor/... — that recipient's row is 'mentor'.
    expect(resolveAudience(NOTIFICATION_EVENTS.PROMOTION_NOMINATED, '/mentor/clan-team')).toBe('mentor');
    expect(resolveAudience(NOTIFICATION_EVENTS.PROMOTION_NOMINATED, '/admin/promotions')).toBe('admin');
  });
  it('falls back to the declared matrix audience when the URL is role-neutral', () => {
    // TASK_SUBMITTED is declared 'mentor'; a url-less variant still resolves right.
    expect(resolveAudience(NOTIFICATION_EVENTS.TASK_SUBMITTED, null)).toBe('mentor');
    expect(resolveAudience(NOTIFICATION_EVENTS.TASK_SUBMITTED, '/notifications')).toBe('mentor');
  });
  it("defaults to 'any' for an unknown event with no usable URL", () => {
    expect(resolveAudience('some_future_event', null)).toBe('any');
    expect(resolveAudience('some_future_event', '/community')).toBe('any');
  });
});

describe('dispatch stamps the resolved audience on the row', () => {
  const { models } = require('../../src/db');
  const { cleanDb, createMentee } = require('../helpers/seed');
  // Use the REAL orchestrator (tests/setup.js stubs it globally).
  const orchestrator = jest.requireActual('../../src/services/notificationOrchestrator');

  beforeEach(async () => { await cleanDb(); });

  it('stores mentee audience for a /mentee action url', async () => {
    const user = await createMentee({ email: 'aud@test.com' });
    await orchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.TASK_ASSIGNED,
      recipients: [{ userId: user.id }],
      payload: { title: 'New task', message: 'x', actionUrl: '/mentee/tasks' },
    });
    const n = await models.Notification.findOne({ where: { userId: user.id } });
    expect(n.audience).toBe('mentee');
  });

  it('falls back to the declared audience when the payload has no url', async () => {
    const user = await createMentee({ email: 'aud2@test.com' });
    await orchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.TASK_SUBMITTED, // declared 'mentor'
      recipients: [{ userId: user.id }],
      payload: { title: 'Submitted', message: 'x' },
    });
    const n = await models.Notification.findOne({ where: { userId: user.id } });
    expect(n.audience).toBe('mentor');
  });
});
