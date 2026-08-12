module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Install pgvector extension (must be superuser, but often supported in managed DBs)
    await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');



    // 4. mentor_style_profiles
    await queryInterface.createTable('mentor_style_profiles', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentor_id: { type: Sequelize.UUID, allowNull: false, unique: true },
      tone: { type: Sequelize.JSONB, defaultValue: { brevity: 0.5, formality: 0.5 } },
      vocab_prefs: { type: Sequelize.JSONB, defaultValue: {} },
      phrase_patterns: { type: Sequelize.JSONB, defaultValue: [] },
      style_examples: { type: Sequelize.JSONB, defaultValue: [] },
      auto_reply_enabled: { type: Sequelize.BOOLEAN, defaultValue: false },
      auto_reply_limit: { type: Sequelize.INTEGER, defaultValue: 100 },
      auto_reply_count: { type: Sequelize.INTEGER, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // 5. knowledge_chunks (Requires manual vector type casting)
    await queryInterface.sequelize.query(`
      DROP TABLE IF EXISTS knowledge_chunks;
      CREATE TABLE knowledge_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        mentor_id UUID NOT NULL,
        mentee_id UUID REFERENCES users(id) ON DELETE CASCADE,
        source_type VARCHAR(50),
        source_id UUID,
        chunk_index INTEGER DEFAULT 0,
        content_hash CHAR(64),
        content TEXT NOT NULL,
        embedding VECTOR(768),
        visibility VARCHAR(20) DEFAULT 'mentor',
        search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
      CREATE INDEX IF NOT EXISTS idx_chunks_fts ON knowledge_chunks USING gin (search_vector);
      CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_mentee_id ON knowledge_chunks (mentee_id) WHERE mentee_id IS NOT NULL;
    `);

    // 6. rag_ingestion_jobs
    await queryInterface.createTable('rag_ingestion_jobs', {
      id:          { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentor_id:   { type: Sequelize.UUID, allowNull: false },
      source_type: { type: Sequelize.STRING(50) },
      source_id:   { type: Sequelize.UUID },
      text:        { type: Sequelize.TEXT, allowNull: false },
      file_name:   { type: Sequelize.STRING(255), allowNull: true, defaultValue: null },
      visibility:  { type: Sequelize.STRING(20), defaultValue: 'mentor' },
      status:      { type: Sequelize.STRING(20), defaultValue: 'pending' },
      attempts:    { type: Sequelize.INTEGER, defaultValue: 0 },
      created_at:  { type: Sequelize.DATE, allowNull: false },
      updated_at:  { type: Sequelize.DATE, allowNull: false }
    });

    // 7. message_drafts
    await queryInterface.createTable('message_drafts', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      message_id: { type: Sequelize.UUID },
      mentor_id: { type: Sequelize.UUID },
      mentee_id: { type: Sequelize.UUID },
      draft_content: { type: Sequelize.TEXT },
      confidence_score: { type: Sequelize.FLOAT },
      retrieved_chunk_ids: { type: Sequelize.JSONB, defaultValue: [] },
      status: { type: Sequelize.STRING(20), defaultValue: 'pending' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // 8. mentor_edit_histories
    await queryInterface.createTable('mentor_edit_histories', {
      id:               { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      draft_id:         { type: Sequelize.UUID },
      mentor_id:        { type: Sequelize.UUID },
      original_content: { type: Sequelize.TEXT },
      final_content:    { type: Sequelize.TEXT },
      edit_distance:    { type: Sequelize.INTEGER },
      status:           { type: Sequelize.STRING(20), defaultValue: 'pending' },
      attempts:         { type: Sequelize.INTEGER, defaultValue: 0 },
      created_at:       { type: Sequelize.DATE, allowNull: false },
      updated_at:       { type: Sequelize.DATE, allowNull: false }
    });

    // 9. Composite index: context-dedup query in contextService scans
    //    (mentor_id, content_hash, source_type) — without this it is a full table scan.
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_chunks_mentor_source_hash
        ON knowledge_chunks (mentor_id, content_hash, source_type);
    `);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('mentor_edit_histories');
    await queryInterface.dropTable('message_drafts');
    await queryInterface.dropTable('rag_ingestion_jobs');
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS knowledge_chunks;');
    await queryInterface.dropTable('mentor_style_profiles');
  }
};
