'use strict';

/**
 * A certificate template is authored once and issued at whichever tier the
 * recipient earned. The layers carry the variation — per-tier wording, per-tier
 * badge art, layers only one tier receives — so the server has to accept and
 * round-trip those two fields without inventing rules the editor cannot keep.
 *
 * The deliberate non-rule: tier ids inside a layer are NOT checked against the
 * template's criteria. Criteria are edited independently of the layout, so
 * validating the reference would make a template unsavable the moment somebody
 * renamed a tier — and the renderer already falls back cleanly for a key it
 * does not recognise.
 */

const { models } = require('../../src/db');
const certificateService = require('../../src/services/certificateService');
const { cleanDb, createAdmin, createProgram } = require('../helpers/seed');

const layer = (over = {}) => ({
  id: 'title', type: 'static', text: 'Certificate of Completion',
  xPercent: 50, yPercent: 30, fontSizePercent: 3,
  color: '#000000', fontWeight: 'bold', alignment: 'center',
  ...over
});

describe('tier-aware certificate layers', () => {
  let admin, program;

  beforeEach(async () => {
    await cleanDb();
    await models.CertificateTemplate.destroy({ where: {}, force: true });
    admin = await createAdmin({ email: 'cert-admin@test.com' });
    program = await createProgram({ createdBy: admin.id });
  });

  const create = (config, criteria = []) => certificateService.createTemplate(
    { name: 'Fellowship Certificate', config, criteria, programId: program.id },
    admin.id
  );

  describe('validation', () => {
    it('accepts per-tier wording and a tier-limited layer', async () => {
      const template = await create([
        layer({ tierValues: { gold: 'Certificate of Excellence', silver: 'Certificate of Merit' } }),
        layer({ id: 'seal', type: 'badge', visibleForTiers: ['gold'], tierValues: { gold: 'https://cdn/gold.png' } })
      ]);
      expect(template.config).toHaveLength(2);
    });

    it('still accepts a layer with neither field — nothing had to change', async () => {
      const template = await create([layer()]);
      expect(template.config[0].tierValues).toBeUndefined();
      expect(template.config[0].visibleForTiers).toBeUndefined();
    });

    it('rejects tierValues that is not a map', async () => {
      await expect(create([layer({ tierValues: ['gold'] })]))
        .rejects.toThrow(/tierValues must be an object/i);
    });

    it('rejects a non-string tier value', async () => {
      await expect(create([layer({ tierValues: { gold: 42 } })]))
        .rejects.toThrow(/tierValues\.gold must be a string/i);
    });

    it('rejects a tier value long enough to be used as storage', async () => {
      await expect(create([layer({ tierValues: { gold: 'x'.repeat(2001) } })]))
        .rejects.toThrow(/too long/i);
    });

    it('rejects visibleForTiers that is not a list', async () => {
      await expect(create([layer({ visibleForTiers: 'gold' })]))
        .rejects.toThrow(/visibleForTiers must be an array/i);
    });

    it('rejects an empty tier id in visibleForTiers', async () => {
      await expect(create([layer({ visibleForTiers: ['gold', '  '] })]))
        .rejects.toThrow(/non-empty tier ids/i);
    });

    it('accepts a tier id the criteria no longer contains', async () => {
      // Criteria and layout are edited separately. A template must stay savable
      // after a tier is renamed away underneath it.
      const template = await create(
        [layer({ tierValues: { removed_tier: 'Old wording' } })],
        [{ id: 'gold', name: 'Gold Certificate' }]
      );
      expect(template.config[0].tierValues.removed_tier).toBe('Old wording');
    });
  });

  describe('round-trip', () => {
    it('keeps both fields intact through create → read → update', async () => {
      const created = await create([
        layer({ tierValues: { gold: 'Gold wording' }, visibleForTiers: ['gold', 'silver'] })
      ]);

      const read = await certificateService.getTemplate(created.id);
      expect(read.config[0].tierValues).toEqual({ gold: 'Gold wording' });
      expect(read.config[0].visibleForTiers).toEqual(['gold', 'silver']);

      const updated = await certificateService.updateTemplate(created.id, {
        config: [layer({ tierValues: { gold: 'Gold wording', bronze: 'Bronze wording' } })]
      });
      expect(updated.config[0].tierValues).toEqual({ gold: 'Gold wording', bronze: 'Bronze wording' });
      expect(updated.config[0].visibleForTiers).toBeUndefined();
    });

    it('carries several badge layers on one template', async () => {
      // The one-badge-per-template limit is gone: a design can hold the earned
      // badge plus a seal only the top tier receives.
      const template = await create([
        { ...layer({ id: 'earned', type: 'badge' }) },
        { ...layer({ id: 'seal', type: 'badge', visibleForTiers: ['gold'] }) }
      ]);
      expect(template.config.filter(el => el.type === 'badge')).toHaveLength(2);
    });
  });
});
