'use strict';

/**
 * Where a feedback report came from.
 *
 * The gap this closes: `user_agent` was the only clue and it is a browser
 * string, so every report from the phone arrived with it empty and looked
 * exactly like a web report from somebody with a strict browser. An admin
 * triaging the board could not tell the two apart, which means the first reply
 * to half the reports was "was this on the app or the site?".
 *
 * Also guards the validation the route never had. It accepted anything and let
 * the service quietly truncate it, so a client could post a five thousand
 * character title and be told nothing at all.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const { cleanDb, createUser } = require('../helpers/seed');

let seq = 0;
const uniqueEmail = () => `fb-${Date.now()}-${seq++}@test.com`;

async function signIn(user, password = 'Test@1234') {
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password });
  return res.body.data.tokens.accessToken;
}

async function report(token, body) {
  return request(app).post('/api/feedback').set('Authorization', `Bearer ${token}`).send(body);
}

describe('feedback reports', () => {
  let mentee;
  let token;

  beforeEach(async () => {
    await cleanDb();
    mentee = await createUser({ email: uniqueEmail(), role: 'mentee' });
    token = await signIn(mentee);
  });

  describe('saying where it happened', () => {
    it('keeps the platform the app reported', async () => {
      const res = await report(token, {
        title: 'The interview recorder stops at ten seconds',
        type: 'bug',
        platform: 'android',
        appVersion: '0.1.0',
        device: 'Pixel 7, Android 14'
      });

      expect(res.status).toBe(201);
      expect(res.body.data.report.platform).toBe('android');
      expect(res.body.data.report.platformLabel).toBe('Android');
      expect(res.body.data.report.appVersion).toBe('0.1.0');
      expect(res.body.data.report.device).toBe('Pixel 7, Android 14');
    });

    it('works out the platform when a client does not say', async () => {
      // An older web build will never send this field, and filing a phone
      // report in the web pile is worse than filing it nowhere.
      const android = await report(token, {
        title: 'Something went wrong on my phone',
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36'
      });
      const iphone = await report(token, {
        title: 'Something went wrong on my phone too',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
      });
      const desktop = await report(token, {
        title: 'Something went wrong on my laptop',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      });

      expect(android.body.data.report.platform).toBe('android');
      expect(iphone.body.data.report.platform).toBe('ios');
      expect(desktop.body.data.report.platform).toBe('web');
    });

    it('refuses a platform that is not one of ours rather than storing it', async () => {
      const res = await report(token, { title: 'A report from nowhere', platform: 'nintendo' });
      expect(res.status).toBe(400);
    });

    it('defaults to web when there is nothing to go on', async () => {
      const res = await report(token, { title: 'No context at all here' });
      expect(res.body.data.report.platform).toBe('web');
    });
  });

  describe('the validation the route never had', () => {
    it('refuses a report with no title', async () => {
      expect((await report(token, { description: 'It broke' })).status).toBe(400);
      expect((await report(token, { title: '   ' })).status).toBe(400);
    });

    it('refuses a title too short to tell reports apart', async () => {
      expect((await report(token, { title: 'x' })).status).toBe(400);
    });

    it('says so rather than silently truncating an overlong title', async () => {
      const res = await report(token, { title: 'x'.repeat(201) });

      expect(res.status).toBe(400);
      expect(await models.FeedbackReport.count()).toBe(0);
    });

    it('refuses a type nobody defined', async () => {
      expect((await report(token, { title: 'A valid title here', type: 'complaint' })).status).toBe(400);
    });

    it('still takes a report with only a title', async () => {
      // The floor stays low on purpose. Somebody hitting a bug should not have
      // to fill in a form to tell us about it.
      const res = await report(token, { title: 'The clan page will not load' });

      expect(res.status).toBe(201);
      expect(res.body.data.report.type).toBe('bug');
      expect(res.body.data.report.status).toBe('open');
    });
  });

  describe('the admin board', () => {
    it('can be filtered to one platform', async () => {
      const admin = await createUser({ email: uniqueEmail(), role: 'admin' });
      const adminToken = await signIn(admin);

      await report(token, { title: 'Broken on the phone', platform: 'android' });
      await report(token, { title: 'Broken in the browser', platform: 'web' });

      const res = await request(app)
        .get('/api/feedback?platform=android')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.reports).toHaveLength(1);
      expect(res.body.data.reports[0].title).toBe('Broken on the phone');
    });

    it('says how the open pile splits before anybody filters it', async () => {
      const admin = await createUser({ email: uniqueEmail(), role: 'admin' });
      const adminToken = await signIn(admin);

      await report(token, { title: 'Broken on the phone', platform: 'android' });
      await report(token, { title: 'Also broken on the phone', platform: 'android' });
      await report(token, { title: 'Broken in the browser', platform: 'web' });

      const res = await request(app).get('/api/feedback').set('Authorization', `Bearer ${adminToken}`);

      expect(res.body.data.byPlatform).toEqual({ web: 1, android: 2, ios: 0 });
    });

    it('is not open to the person who filed the report', async () => {
      const res = await request(app).get('/api/feedback').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });
  });

  it('lets the reporter see their own, whatever the platform', async () => {
    await report(token, { title: 'Broken on the phone', platform: 'android' });

    const res = await request(app).get('/api/feedback/mine').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.reports).toHaveLength(1);
    expect(res.body.data.reports[0].platform).toBe('android');
  });
});
