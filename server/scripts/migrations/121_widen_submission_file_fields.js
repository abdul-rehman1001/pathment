/* eslint-disable no-console */

/**
 * Task submission files store the browser MIME type in `file_type`.
 * Office Open XML types exceed VARCHAR(50), e.g.:
 *   application/vnd.openxmlformats-officedocument.wordprocessingml.document (71)
 * so .docx / .xlsx / .pptx uploads died at INSERT after Cloudinary succeeded.
 *
 * Only widens `file_type` to VARCHAR(255). Does not touch `file_name`
 * (already VARCHAR(255)). Existing rows are preserved as-is.
 *
 * Run:      node server/scripts/migrations/121_widen_submission_file_fields.js
 * Rollback: node server/scripts/migrations/121_widen_submission_file_fields.js --rollback
 */
async function up({ db = require('./_db') } = {}) {
  await db.transaction(async (transaction) => {
    const query = (sql) => db.query(sql, { transaction });

    await query(`ALTER TABLE task_submission_files
      ALTER COLUMN file_type TYPE VARCHAR(255)`);
  });
  console.log('✓ task_submission_files.file_type → VARCHAR(255)');
}

async function down({ db = require('./_db') } = {}) {
  await db.transaction(async (transaction) => {
    const query = (sql) => db.query(sql, { transaction });

    const [rows] = await query(`
      SELECT COUNT(*)::int AS count
      FROM task_submission_files
      WHERE file_type IS NOT NULL AND char_length(file_type) > 50
    `);
    const tooLong = rows[0]?.count || 0;
    if (tooLong > 0) {
      throw new Error(
        `Cannot rollback: ${tooLong} file_type value(s) exceed 50 characters. ` +
          'Shorten or remove those rows before reverting to VARCHAR(50).'
      );
    }

    await query(`ALTER TABLE task_submission_files
      ALTER COLUMN file_type TYPE VARCHAR(50)`);
  });
  console.log('✓ Reverted task_submission_files.file_type to VARCHAR(50)');
}

module.exports = { up, down };

if (require.main === module) {
  const db = require('./_db');
  (process.argv.includes('--rollback') ? down({ db }) : up({ db }))
    .catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db.close());
}
