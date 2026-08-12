const aiConnectionService = require('../../../services/aiConnectionService');
const { resolveGeminiKey } = aiConnectionService;
const { models: { KnowledgeChunk, MentorStyleProfile, MessageDraft, Message } } = require('../../../db');
const retrievalService = require('./retrievalService');
const promptBuilder = require('./promptBuilder');
const generationService = require('./generationService');
const groundingService = require('./groundingService');
const contextService = require('./contextService');
const config = require('../ragConfig');
const logger = require('../../../utils/logger');
const { emitToUser, emitToConversation } = require('../../../socket');
const messagingService = require('../../../services/messagingService');

async function handleNewMessage(message) {
  const { senderId: menteeId, recipientId: mentorId, messageText: query, threadId: conversationId, id: messageId } = message;

  try {
    // ── 1. Fetch mentor's style profile ─────────────────────────────────
    const [styleProfile] = await MentorStyleProfile.findOrCreate({
      where: { mentorId },
      defaults: { tone: { brevity: 0.5, formality: 0.5 }, autoReplyEnabled: false }
    });

    // ── 2. Strict BYOK key resolution ────────────────────────────────────
    const geminiKey = await resolveGeminiKey(mentorId);
    const groqConfig = await aiConnectionService.resolveActiveConfig('rag_generation', mentorId);

    if (!geminiKey) {
      logger.warn('[RAG] Skipping — mentor has no Gemini key configured (BYOK only)', { mentorId });
      return;
    }
    if (!groqConfig?.apiKey) {
      logger.warn('[RAG] Skipping — mentor has no generation key routed to rag_generation (BYOK only)', { mentorId });
      return;
    }

    logger.info('[RAG] Starting pipeline', { mentorId, menteeId, query: query?.substring(0, 80) });

    // ── 3. Async: save mentee's question as conversation context chunk ────
    // Fire-and-forget — this must not block or crash the main pipeline.
    // Context type = 'conversation_context' (questions only, never answers)
    contextService.saveConversationContext({
      mentorId, menteeId, conversationId, messageId, queryText: query, geminiApiKey: geminiKey
    }).catch(e => logger.warn('[RAG] Context save failed (non-fatal)', { error: e.message }));

    // ── 4. Retrieval (document chunks + previous context chunks) ──────────
    const chunks = await retrievalService.retrieveContext({ query, mentorId, menteeId, geminiApiKey: geminiKey });

    // Check if we retrieved any real knowledge base documents (sourceType='mentor_document' or undefined)
    const hasFacts = chunks.some(c => !c.source_type || c.source_type === 'mentor_document');
    if (!hasFacts) {
      logger.info('[RAG] No factual document context found (only style/context chunks retrieved), abstaining early', { mentorId });
      return;
    }

    // Fetch last 10 messages of this thread to build conversation context (excluding current)
    const recentMessages = await Message.findAll({
      where: { threadId: conversationId },
      order: [['createdAt', 'DESC']],
      limit: 11
    });
    const recentTurns = recentMessages
      .filter(m => m.id !== messageId)
      .slice(0, 10)
      .reverse()
      .map(m => ({
        role: m.senderId === mentorId ? 'Mentor' : 'Mentee',
        text: m.messageText
      }));

    // ── 5. Build prompt ───────────────────────────────────────────────────
    const { system, user } = promptBuilder.buildPrompt({ chunks, styleProfile, recentTurns, query });

    // ── 6. Generate ───────────────────────────────────────────────────────
    const draftText = await generationService.generate({ system, user, generationConfig: groqConfig });
    if (!draftText || draftText === '[ABSTAIN_NO_CONTEXT]') {
      logger.info('[RAG] LLM abstained', { mentorId });
      return;
    }

    // ── 7. Grounding / Confidence ─────────────────────────────────────────
    let confidence = 1.0;
    const groundingConfig = await aiConnectionService.resolveActiveConfig('rag_grounding', mentorId);
    if (groundingConfig?.apiKey) {
      confidence = await groundingService.scoreGrounding({ draftText, chunks, geminiApiKey: groundingConfig.apiKey });
    } else {
      logger.info('[RAG] Grounding / fact-checking is disabled or has no key configured. Skipping grounding score.');
    }

    // ── 8. Decide: Auto-send | Draft | Abstain ────────────────────────────
    const { autoReply: autoReplyThreshold, draftReview: draftThreshold } = config.thresholds;

    // Only auto-reply if confidence is high AND the mentor explicitly turned on auto-reply
    let shouldAutoReply = confidence >= autoReplyThreshold && styleProfile.autoReplyEnabled;
    if (shouldAutoReply) {
      const currentCount = styleProfile.autoReplyCount || 0;
      const limit = styleProfile.autoReplyLimit || 100;
      if (currentCount >= limit) {
        logger.info('[RAG] Auto-reply quota exceeded, falling back to draft creation', { mentorId, count: currentCount, limit });
        shouldAutoReply = false;
      }
    }

    if (shouldAutoReply) {
      logger.info('[RAG] Auto-reply triggered', { mentorId, confidence });
      const result = await messagingService.sendMessage(mentorId, { conversationId, messageText: draftText });
      await styleProfile.increment('autoReplyCount');
      emitToConversation(result.conversationId, 'message:new', { conversationId: result.conversationId, message: result.message });

    } else if (confidence >= draftThreshold) {
      const draft = await MessageDraft.create({
        messageId,
        mentorId,
        menteeId,
        draftContent: draftText,
        confidenceScore: confidence,
        retrievedChunkIds: chunks.map(c => c.id),
        status: 'pending'
      });
      logger.info('[RAG] Draft created for review', { mentorId, confidence, draftId: draft.id });
      emitToUser(mentorId, 'ai_draft:new', {
        draft: { ...draft.toJSON(), originalMessage: message.toJSON ? message.toJSON() : message }
      });

    } else {
      logger.info('[RAG] Confidence too low, abstaining', { mentorId, confidence });
    }

  } catch (err) {
    logger.error('[RAG] Orchestrator error', { error: err.message, stack: err.stack, mentorId });
  }
}

module.exports = { handleNewMessage };
