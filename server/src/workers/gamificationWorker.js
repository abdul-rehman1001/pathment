'use strict';

/**
 * Gamification worker — processes badge side-effects off the request path.
 *
 * Clan roster changes emit `clan.member_added` on appEvents; this worker drains
 * them serially (one job at a time) so we never stampede the DB the way
 * unbounded setImmediate did. Same idea as email/certificate workers: producers
 * enqueue, this process owns delivery.
 */
const { Op } = require('sequelize');
const appEvents = require('../events/appEvents');
const { models } = require('../db');
const { runWithRequestContext } = require('../utils/auditContext');
const gamificationService = require('../services/gamificationService');

const MENTOR_CLAN_ROLES = ['lead_mentor', 'co_mentor', 'core_team'];

const queue = [];
let pumping = false;
let started = false;

function enqueue(job) {
  if (!job?.organizationId || !job?.userId || !job?.clanId || !job?.role) {
    console.warn('[gamification-worker] dropped clan.member_added job: missing organizationId/clanId/userId/role');
    return;
  }
  queue.push(job);
  void pump();
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const job = queue.shift();
      try {
        await processClanMemberAdded(job);
      } catch (err) {
        console.error('[gamification-worker] clan.member_added failed:', err?.message);
      }
    }
  } finally {
    pumping = false;
    if (queue.length) void pump();
  }
}

async function processClanMemberAdded({ organizationId, clanId, userId, role }) {
  if (!organizationId) {
    console.warn('[gamification-worker] skipped job without organizationId');
    return;
  }

  // Bind ALS workspace then query with explicit organizationId (no scope bypass).
  await runWithRequestContext({ organizationId }, async () => {
    if (MENTOR_CLAN_ROLES.includes(role)) {
      await gamificationService.checkAndAwardBadges(userId);
      return;
    }
    if (role !== 'mentee') return;

    const mentors = await models.ClanMembership.findAll({
      where: {
        clanId,
        organizationId,
        status: 'active',
        role: { [Op.in]: MENTOR_CLAN_ROLES },
      },
      attributes: ['userId'],
      raw: true,
    });
    for (const m of mentors) {
      await gamificationService.checkAndAwardBadges(m.userId);
    }
  });
}

function start() {
  if (started) return;
  started = true;
  appEvents.on('clan.member_added', enqueue);
  console.log('✓ Gamification worker started (clan.member_added)');
}

function stop() {
  if (!started) return;
  appEvents.removeListener('clan.member_added', enqueue);
  started = false;
  queue.length = 0;
}

module.exports = { start, stop, enqueue, processClanMemberAdded };
