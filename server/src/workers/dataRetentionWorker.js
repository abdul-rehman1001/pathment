const logger = require('../utils/logger');
const retention = require('../services/dataRetentionService');
let timer;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const { sequelize } = require('../db');
    // Each batch locks only its candidate rows and skips other workers' locks.
    logger.info('Data retention completed', await retention.apply(sequelize));
  } catch (error) {
    logger.error('Data retention failed', { message: error.message });
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  // Delay the first pass until the API has finished starting.
  const first = setTimeout(tick, 60_000);
  first.unref();
  timer = setInterval(tick, 24 * 60 * 60 * 1000);
  timer.unref();
}

module.exports = { start };
