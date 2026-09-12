const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const certificateService = require('../services/certificateService');
const { enrichEvaluationResults } = require('../utils/certificateUtils');
const { emitToUser } = require('../socket');
const logger = require('../utils/logger');

// ==================== WORKER CONFIGURATION ====================

const AI_EVAL_POLL_MS = Number(process.env.AI_EVAL_WORKER_POLL_MS) || 1000;

const MAX_AI_EVAL_ATTEMPTS = 3;
const BATCH_SIZE = 10;
const CONCURRENT_BATCHES = 4;

let aiEvalTimer = null;
let aiEvalRunning = false;

// ==================== AI EVALUATION WORKER LOGIC ====================

async function checkRunCompletion(runId, triggeredBy) {
  const stats = await models.AIEvaluationQueue.findAll({
    where: { runId },
    attributes: [
      'status',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['status'],
    raw: true
  });

  const statusMap = {};
  let total = 0;
  for (const s of stats) {
    statusMap[s.status] = parseInt(s.count, 10);
    total += parseInt(s.count, 10);
  }

  const pending    = statusMap['pending']    || 0;
  const processing = statusMap['processing'] || 0;
  const completed  = statusMap['completed']  || 0;
  const failed     = statusMap['failed']     || 0;

  if (pending === 0 && processing === 0) {
    const finishedJobs = await models.AIEvaluationQueue.findAll({
      where: { runId, status: 'completed' },
      attributes: ['menteeId', 'result', 'templateId'],
      raw: true
    });

    const results = finishedJobs.map(j => j.result).filter(Boolean);
    const enrichedResults = await enrichEvaluationResults(results);
    const templateId = finishedJobs[0]?.templateId ?? null;

    if (templateId) {
      const ranAt = new Date().toISOString();
      await models.CertificateTemplate.update(
        { aiEvaluation: { results: enrichedResults, ranAt }, aiEvaluationRanAt: ranAt },
        { where: { id: templateId } }
      );
    }

    emitToUser(triggeredBy, 'ai-eval:complete', {
      runId,
      results: enrichedResults,
      ranAt: new Date().toISOString(),
      total,
      completed,
      failed
    });

    logger.info(`[Certificate Worker - AI Eval] Run ${runId} complete: ${completed} done, ${failed} failed out of ${total}`);
  }
}

async function processBatchJobs(batchJobs) {
  if (!batchJobs || batchJobs.length === 0) return;

  const templateId  = batchJobs[0].templateId;
  const triggeredBy = batchJobs[0].triggeredBy;
  const runId       = batchJobs[0].runId;

  try {
    logger.info(`[Certificate Worker - AI Eval] Processing micro-batch of ${batchJobs.length} mentees for run ${runId}`);
    const template = await models.CertificateTemplate.findByPk(templateId);

    const batchItems = batchJobs.map(j => ({
      menteeId:      j.menteeId,
      menteePayload: j.menteePayload,
      preCheck:      j.preCheck
    }));

    const batchResults = await certificateService.evaluateBatchMentees(template, batchItems, triggeredBy);
    const resultMap = new Map(batchResults.map(r => [r.menteeId, r.result]));

    for (const job of batchJobs) {
      const result = resultMap.get(job.menteeId) || certificateService.buildFallbackResult(job.menteePayload, job.preCheck);
      job.status = 'completed';
      job.result = result;
      job.error  = null;
      await job.save();
    }

    const [{ completedCount, totalCount }] = await sequelize.query(
      `SELECT COUNT(*) FILTER (WHERE status IN ('completed', 'failed')) AS "completedCount", COUNT(*) AS "totalCount" FROM ai_evaluation_queue WHERE run_id = :runId`,
      { replacements: { runId }, type: sequelize.QueryTypes.SELECT }
    );

    const menteeIds = batchJobs.map(j => j.menteeId);
    const mentees = await models.User.findAll({
      where: { id: { [Op.in]: menteeIds } },
      attributes: ['id', 'firstName', 'lastName', 'email'],
      raw: true
    });
    const menteeMap = new Map(mentees.map(m => [m.id, m]));

    for (const job of batchJobs) {
      const mentee = menteeMap.get(job.menteeId);
      const result = job.result;

      emitToUser(triggeredBy, 'ai-eval:progress', {
        runId,
        menteeId: job.menteeId,
        result: {
          ...result,
          firstName: mentee?.firstName ?? '',
          lastName:  mentee?.lastName  ?? '',
          email:     mentee?.email     ?? ''
        },
        completed: completedCount,
        total:     totalCount
      });
    }

    logger.info(`[Certificate Worker - AI Eval] Micro-batch completed (${completedCount}/${totalCount})`);
    await checkRunCompletion(runId, triggeredBy);
  } catch (batchError) {
    logger.error(`[Certificate Worker - AI Eval] Micro-batch failed: ${batchError.stack || batchError.message}`);

    let errorCompletedCount = 0;
    let errorTotalCount = 0;
    try {
      const [counts] = await sequelize.query(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('completed', 'failed')) AS "completedCount",
           COUNT(*) AS "totalCount"
         FROM ai_evaluation_queue WHERE run_id = :runId`,
        { replacements: { runId }, type: sequelize.QueryTypes.SELECT }
      );
      errorCompletedCount = Number(counts?.completedCount ?? 0);
      errorTotalCount     = Number(counts?.totalCount     ?? 0);
    } catch (_) { }

    for (const job of batchJobs) {
      job.status = job.attempts >= MAX_AI_EVAL_ATTEMPTS ? 'failed' : 'pending';
      job.error  = batchError.message;
      await job.save();

      if (job.status === 'failed') {
        const fallbackResult = certificateService.buildFallbackResult(
          job.menteePayload,
          job.preCheck
        );

        const mentee = await models.User.findByPk(job.menteeId, {
          attributes: ['id', 'firstName', 'lastName', 'email'],
          raw: true
        });

        emitToUser(triggeredBy, 'ai-eval:progress', {
          runId:    job.runId,
          menteeId: job.menteeId,
          result: {
            ...fallbackResult,
            firstName: mentee?.firstName ?? '',
            lastName:  mentee?.lastName  ?? '',
            email:     mentee?.email     ?? '',
            _failed: true
          },
          completed: errorCompletedCount,
          total:     errorTotalCount
        });
      }
    }
  }
}

async function tickAIEval() {
  if (aiEvalRunning) return;
  aiEvalRunning = true;

  try {
    const allBatchJobs = [];

    for (let b = 0; b < CONCURRENT_BATCHES; b++) {
      const batchJobs = await sequelize.transaction(async (t) => {
        const nextTarget = await models.AIEvaluationQueue.findOne({
          where: {
            [Op.or]: [
              { status: 'pending' },
              {
                status:   'processing',
                lockedAt: { [Op.lt]: new Date(Date.now() - 45000) }
              }
            ],
            attempts: { [Op.lt]: MAX_AI_EVAL_ATTEMPTS }
          },
          order:      [['createdAt', 'ASC']],
          attributes: ['runId'],
          raw: true,
          transaction: t
        });

        if (!nextTarget) return [];

        const pendingJobs = await models.AIEvaluationQueue.findAll({
          where: {
            runId: nextTarget.runId,
            [Op.or]: [
              { status: 'pending' },
              {
                status:   'processing',
                lockedAt: { [Op.lt]: new Date(Date.now() - 45000) }
              }
            ],
            attempts: { [Op.lt]: MAX_AI_EVAL_ATTEMPTS }
          },
          order:       [['createdAt', 'ASC']],
          limit:       BATCH_SIZE,
          lock:        { level: t.LOCK.UPDATE, of: models.AIEvaluationQueue },
          skipLocked:  true,
          transaction: t
        });

        if (!pendingJobs.length) return [];

        const now = new Date();
        for (const j of pendingJobs) {
          j.status   = 'processing';
          j.lockedAt = now;
          j.attempts += 1;
          await j.save({ transaction: t });
        }

        return pendingJobs;
      });

      if (batchJobs && batchJobs.length > 0) {
        allBatchJobs.push(batchJobs);
      } else {
        break;
      }
    }

    if (allBatchJobs.length > 0) {
      await Promise.allSettled(allBatchJobs.map(jobs => processBatchJobs(jobs)));
    }
  } catch (err) {
    logger.error(`[Certificate Worker - AI Eval] Tick error: ${err.message}`);
  } finally {
    aiEvalRunning = false;
  }
}

// ==================== WORKER CONTROLS ====================

function start() {
  if (!aiEvalTimer && process.env.AI_EVAL_WORKER_DISABLED !== 'true') {
    aiEvalTimer = setInterval(tickAIEval, AI_EVAL_POLL_MS);
    if (aiEvalTimer.unref) aiEvalTimer.unref();
    logger.info(`Certificate AI Evaluation worker started (polling every ${AI_EVAL_POLL_MS}ms)`);
  }
}

async function stop() {
  if (aiEvalTimer) {
    clearInterval(aiEvalTimer);
    aiEvalTimer = null;
  }

  let waitCount = 0;
  while (aiEvalRunning && waitCount < 10) {
    await new Promise(r => setTimeout(r, 500));
    waitCount++;
  }
  logger.info('Certificate worker (AI Eval) stopped gracefully');
}

module.exports = { start, stop, tickAIEval };
