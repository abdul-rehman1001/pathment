/**
 * Migration: 099_certificate_per_tier_artwork
 *
 * Three related changes to how a certificate is defined and issued.
 *
 * 1. THE CERTIFICATE IS THE TIER'S ARTWORK.
 *    A template used to be one background image with badge layers pasted onto
 *    it, so every tier shared one design and differed only by a small badge.
 *    Now each tier carries its own full-bleed artwork (`artworkUrl`) and its
 *    own placements for the recipient's name, the date and the certificate
 *    number (`layout`) — because two tiers' artwork rarely puts the name in the
 *    same place. Existing templates are CONVERTED rather than left behind: the
 *    old background becomes every tier's artwork and the old layer list becomes
 *    every tier's layout, so an untouched template renders as it did.
 *
 * 2. EVERY ISSUED CERTIFICATE GETS A UNIQUE NUMBER.
 *    Opaque, Coursera-shaped (`7K4M2XQ9P3TD`), printed on the certificate and
 *    resolvable on a public verification page. Already-issued certificates are
 *    backfilled so no credential is left without one.
 *
 * 3. MENTORS VERIFY BEFORE ISSUANCE.
 *    `certificate_verifications` is the review round: what the AI assigned,
 *    what the mentor decided, whether that was an override, and who signed it
 *    off. One row per (template, mentee).
 *
 * Run:      node server/scripts/migrations/099_certificate_per_tier_artwork.js
 * Rollback: node server/scripts/migrations/099_certificate_per_tier_artwork.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const NUMBER_UNIQ = 'certificate_instances_number_uniq';
const VERIFICATION_UNIQ = 'certificate_verifications_template_mentee_uniq';

// Opaque and unambiguous: no 0/O/1/I so a number read off a printed PDF and
// typed into the verify page lands on the right credential.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const NUMBER_LENGTH = 12;

function generateNumber() {
  const bytes = require('crypto').randomBytes(NUMBER_LENGTH);
  let out = '';
  for (let i = 0; i < NUMBER_LENGTH; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

async function columnExists(table, column, t) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = :table AND column_name = :column`,
    { replacements: { table, column }, transaction: t }
  );
  return rows.length > 0;
}

async function tableExists(table, t) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = :table`,
    { replacements: { table }, transaction: t }
  );
  return rows.length > 0;
}

async function indexExists(name, t) {
  const [rows] = await sequelize.query(
    'SELECT 1 FROM pg_indexes WHERE indexname = :name',
    { replacements: { name }, transaction: t }
  );
  return rows.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 099: per-tier certificate artwork, numbers, verification');

  await sequelize.transaction(async (t) => {
    // ── 1. Template: a deadline for the mentor review round ──────────────────
    if (await columnExists('certificate_templates', 'verification_deadline', t)) {
      console.log('  ℹ certificate_templates.verification_deadline exists, skipping');
    } else {
      await qi.addColumn('certificate_templates', 'verification_deadline', {
        type: Sequelize.DATE, allowNull: true
      }, { transaction: t });
      console.log('  ✓ Added certificate_templates.verification_deadline');
    }

    // ── 2. Instance: the unique certificate number ───────────────────────────
    if (await columnExists('certificate_instances', 'certificate_number', t)) {
      console.log('  ℹ certificate_instances.certificate_number exists, skipping');
    } else {
      await qi.addColumn('certificate_instances', 'certificate_number', {
        type: Sequelize.STRING(32), allowNull: true
      }, { transaction: t });
      console.log('  ✓ Added certificate_instances.certificate_number');
    }

    // Backfill, one row at a time so a collision only retries that row. The
    // table is small (issued credentials, not events) and this runs once.
    const [needNumber] = await sequelize.query(
      'SELECT id FROM certificate_instances WHERE certificate_number IS NULL',
      { transaction: t }
    );
    if (needNumber.length) {
      const used = new Set();
      const [existing] = await sequelize.query(
        'SELECT certificate_number FROM certificate_instances WHERE certificate_number IS NOT NULL',
        { transaction: t }
      );
      existing.forEach((r) => used.add(r.certificate_number));

      for (const row of needNumber) {
        let number = generateNumber();
        while (used.has(number)) number = generateNumber();
        used.add(number);
        await sequelize.query(
          'UPDATE certificate_instances SET certificate_number = :number WHERE id = :id',
          { replacements: { number, id: row.id }, transaction: t }
        );
      }
      console.log(`  ✓ Backfilled ${needNumber.length} certificate number(s)`);
    } else {
      console.log('  ℹ No certificates needed a number');
    }

    if (await indexExists(NUMBER_UNIQ, t)) {
      console.log(`  ℹ ${NUMBER_UNIQ} exists, skipping`);
    } else {
      await sequelize.query(
        `CREATE UNIQUE INDEX ${NUMBER_UNIQ} ON certificate_instances (certificate_number)
         WHERE certificate_number IS NOT NULL`,
        { transaction: t }
      );
      console.log(`  ✓ Created unique index ${NUMBER_UNIQ}`);
    }

    // ── 3. The mentor verification round ─────────────────────────────────────
    if (await tableExists('certificate_verifications', t)) {
      console.log('  ℹ certificate_verifications exists, skipping create');
    } else {
      await qi.createTable('certificate_verifications', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        template_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'certificate_templates', key: 'id' },
          onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        mentee_id: {
          type: Sequelize.UUID, allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE', onDelete: 'CASCADE'
        },
        clan_id: {
          type: Sequelize.UUID, allowNull: true,
          references: { model: 'clans', key: 'id' },
          onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        // What the AI proposed, kept even after an override so the admin can
        // see what was changed and by how much.
        ai_tier: { type: Sequelize.STRING(50), allowNull: true },
        ai_match_score: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
        // What will actually be issued.
        final_tier: { type: Sequelize.STRING(50), allowNull: true },
        overridden: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        override_reason: { type: Sequelize.TEXT, allowNull: true },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
        verified_by: {
          type: Sequelize.UUID, allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        verified_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW }
      }, { transaction: t });
      console.log('  ✓ Created certificate_verifications');
    }

    if (await indexExists(VERIFICATION_UNIQ, t)) {
      console.log(`  ℹ ${VERIFICATION_UNIQ} exists, skipping`);
    } else {
      // One review row per person per template: re-running the AI updates the
      // row rather than stacking a second opinion beside the first.
      await sequelize.query(
        `CREATE UNIQUE INDEX ${VERIFICATION_UNIQ}
         ON certificate_verifications (template_id, mentee_id)`,
        { transaction: t }
      );
      console.log(`  ✓ Created unique index ${VERIFICATION_UNIQ}`);
    }

    for (const [name, cols] of [
      ['certificate_verifications_clan_status_idx', '(clan_id, status)'],
      ['certificate_verifications_template_status_idx', '(template_id, status)']
    ]) {
      if (await indexExists(name, t)) continue;
      await sequelize.query(`CREATE INDEX ${name} ON certificate_verifications ${cols}`, { transaction: t });
      console.log(`  ✓ Created index ${name}`);
    }

    // ── 4. Convert existing templates to per-tier artwork ────────────────────
    // The old background becomes every tier's artwork and the old layer list
    // becomes every tier's layout, so a template nobody touches keeps looking
    // exactly the way it looks today.
    const [templates] = await sequelize.query(
      'SELECT id, bg_image_url, config, criteria FROM certificate_templates',
      { transaction: t }
    );
    let converted = 0;
    for (const tpl of templates) {
      const criteria = Array.isArray(tpl.criteria) ? tpl.criteria : [];
      if (!criteria.length) continue;
      // Already converted? Leave it alone — this migration must be re-runnable.
      if (criteria.every((c) => c && typeof c.artworkUrl === 'string')) continue;

      const layout = Array.isArray(tpl.config) ? tpl.config : [];
      const next = criteria.map((c) => ({
        ...c,
        artworkUrl: typeof c.artworkUrl === 'string' ? c.artworkUrl : (tpl.bg_image_url || ''),
        layout: Array.isArray(c.layout) ? c.layout : layout
      }));
      await sequelize.query(
        'UPDATE certificate_templates SET criteria = :criteria WHERE id = :id',
        { replacements: { criteria: JSON.stringify(next), id: tpl.id }, transaction: t }
      );
      converted += 1;
    }
    console.log(`  ✓ Converted ${converted} template(s) to per-tier artwork`);
  });

  console.log('✅ Migration 099 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 099');

  await sequelize.transaction(async (t) => {
    if (await tableExists('certificate_verifications', t)) {
      await qi.dropTable('certificate_verifications', { transaction: t });
      console.log('  ✓ Dropped certificate_verifications');
    }
    if (await indexExists(NUMBER_UNIQ, t)) {
      await sequelize.query(`DROP INDEX ${NUMBER_UNIQ}`, { transaction: t });
    }
    if (await columnExists('certificate_instances', 'certificate_number', t)) {
      await qi.removeColumn('certificate_instances', 'certificate_number', { transaction: t });
      console.log('  ✓ Removed certificate_instances.certificate_number');
    }
    if (await columnExists('certificate_templates', 'verification_deadline', t)) {
      await qi.removeColumn('certificate_templates', 'verification_deadline', { transaction: t });
      console.log('  ✓ Removed certificate_templates.verification_deadline');
    }
    // `criteria[].artworkUrl` / `[].layout` are left in place: they are additive
    // JSONB keys the old renderer ignores, and stripping them would throw away
    // per-tier designs somebody authored after the migration ran.
    console.log('  ℹ Left criteria[].artworkUrl / .layout in place (additive, non-breaking)');
  });

  console.log('✅ Rollback 099 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => {
    try {
      await (isRollback ? down() : up());
      process.exit(0);
    } catch (e) {
      console.error('Migration failed:', e.message);
      process.exit(1);
    }
  })();
}

module.exports = { up, down, generateNumber, ALPHABET, NUMBER_LENGTH };
