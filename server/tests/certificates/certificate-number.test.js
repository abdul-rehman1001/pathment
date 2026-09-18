'use strict';

/**
 * Every issued credential carries a unique, public number.
 *
 * The number is the credential's identity outside Pathment: it goes on the
 * certificate, onto a CV, and into a public verification page that anybody can
 * open. So it has to be unique, unguessable, and resolvable to exactly the
 * claim it was issued for — and to nothing else.
 */

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const clanService = require('../../src/services/clanService');
const certificateService = require('../../src/services/certificateService');
const { cleanDb, createAdmin, createMentee, createProgram } = require('../helpers/seed');
const { isCertificateNumber } = require('../../src/utils/certificateNumber');

describe('certificate numbers and public verification', () => {
  let admin, mentee, other, program, clan, template;

  beforeEach(async () => {
    await cleanDb();
    await models.CertificateVerification.destroy({ where: {}, force: true });
    await models.CertificateInstance.destroy({ where: {}, force: true });
    await models.CertificateTemplate.destroy({ where: {}, force: true });

    admin = await createAdmin({ email: 'cert-admin@test.com' });
    mentee = await createMentee({ email: 'saleha@test.com', firstName: 'Saleha', lastName: 'Younis' });
    other = await createMentee({ email: 'other@test.com' });
    program = await createProgram({ createdBy: admin.id, name: 'Full Stack AI Engineering' });
    clan = await models.Clan.create({
      programId: program.id, name: 'Viral Loop', leadMentorId: admin.id, createdBy: admin.id
    });
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });
    await clanService.addMember(clan.id, { userId: other.id, role: 'mentee' });

    template = await certificateService.createTemplate({
      name: 'Fellowship',
      config: [],
      criteria: [
        { id: 'bronze', name: 'Bronze Certificate', artworkUrl: 'https://cdn/bronze.png', layout: [] },
        { id: 'participation', name: 'Participation Certificate', artworkUrl: 'https://cdn/part.png', layout: [] }
      ],
      programId: program.id
    }, admin.id);
  });

  const issue = (menteeId, tier = 'bronze') => certificateService.issueCertificates(
    { templateId: template.id, recipients: [{ menteeId, tier }] }, admin.id, admin
  );

  describe('assignment', () => {
    it('gives every issued certificate a well-formed number', async () => {
      await issue(mentee.id);
      const inst = await models.CertificateInstance.findOne({ where: { menteeId: mentee.id } });
      expect(isCertificateNumber(inst.certificateNumber)).toBe(true);
      expect(inst.certificateNumber).toHaveLength(12);
    });

    it('never repeats a number across certificates', async () => {
      await issue(mentee.id);
      await issue(other.id);
      const all = await models.CertificateInstance.findAll({ attributes: ['certificateNumber'] });
      const numbers = all.map((i) => i.certificateNumber);
      expect(new Set(numbers).size).toBe(numbers.length);
    });

    it('is not sequential — it leaks neither volume nor a neighbour\'s code', async () => {
      await issue(mentee.id);
      await issue(other.id);
      const [a, b] = (await models.CertificateInstance.findAll({ order: [['createdAt', 'ASC']] }))
        .map((i) => i.certificateNumber);
      expect(a).not.toBe(b);
      // Adjacent issuances must not differ by a predictable step.
      expect(a.slice(0, 8)).not.toBe(b.slice(0, 8));
    });

    it('refuses a duplicate number at the database, not just in code', async () => {
      await issue(mentee.id);
      const taken = (await models.CertificateInstance.findOne()).certificateNumber;
      await expect(models.CertificateInstance.create({
        templateId: template.id, menteeId: other.id, issuedBy: admin.id,
        tier: 'bronze', certificateNumber: taken
      })).rejects.toThrow();
    });
  });

  describe('public verification', () => {
    let number;
    beforeEach(async () => {
      await issue(mentee.id, 'bronze');
      number = (await models.CertificateInstance.findOne({ where: { menteeId: mentee.id } })).certificateNumber;
    });

    it('confirms a real credential without any login', async () => {
      const res = await request(app).get(`/api/public/verify/${number}`);
      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.recipientName).toBe('Saleha Younis');
      expect(res.body.data.tierName).toBe('Bronze Certificate');
      expect(res.body.data.programName).toBe('Full Stack AI Engineering');
      expect(res.body.data.issuedAt).toBeTruthy();
    });

    it('leaks nothing beyond the claim itself', async () => {
      // Anybody on the internet can call this, so the payload is the whole
      // security boundary: no email, no ids, no scores, no internal state.
      const res = await request(app).get(`/api/public/verify/${number}`);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('saleha@test.com');
      expect(body).not.toContain(mentee.id);
      expect(body).not.toContain(template.id);
      expect(Object.keys(res.body.data).sort()).toEqual([
        'certificateNumber', 'issuedAt', 'programName', 'recipientName',
        'templateName', 'tier', 'tierName', 'valid'
      ]);
    });

    it('tolerates how people actually type it', async () => {
      const messy = ` ${number.slice(0, 4)}-${number.slice(4, 8)} ${number.slice(8)} `.toLowerCase();
      const res = await request(app).get(`/api/public/verify/${encodeURIComponent(messy)}`);
      expect(res.body.data.valid).toBe(true);
    });

    it('answers "not found" for an unknown code, with the same shape', async () => {
      const res = await request(app).get('/api/public/verify/ZZZZZZZZZZZZ');
      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.recipientName).toBeUndefined();
    });

    it('refuses junk before it reaches the database', async () => {
      for (const junk of ['abc', '../../etc/passwd', '7K4M2XQ9P3T0']) {
        const res = await request(app).get(`/api/public/verify/${encodeURIComponent(junk)}`);
        expect(res.status).toBe(200);
        expect(res.body.data.valid).toBe(false);
      }
    });
  });
});
