const { models, Sequelize, sequelize } = require('../db');
const { ValidationError } = require('../utils/errors/errorTypes');
const { Op } = Sequelize;

function normalizeUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl.trim());
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host}${pathname}${parsed.search}`;
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/+$/, '');
  }
}

async function list({ search } = {}) {
  const where = search ? { name: { [Op.iLike]: `%${search}%` } } : {};
  return models.OpenSourceOrg.findAll({ where, order: [['name', 'ASC']], limit: 50 });
}

async function findOrCreate({ name, url, userId }) {
  if (!name || !url) throw new ValidationError('name and url are required');

  const trimmedName = name.trim();
  const normUrl = normalizeUrl(url);

  const existing = await models.OpenSourceOrg.findOne({
    where: {
      [Op.or]: [
        sequelize.where(sequelize.fn('lower', sequelize.col('name')), trimmedName.toLowerCase()),
        sequelize.where(sequelize.fn('lower', sequelize.col('url')), normUrl.toLowerCase()),
        sequelize.where(sequelize.fn('lower', sequelize.col('url')), `${normUrl.toLowerCase()}/`),
      ]
    }
  });

  if (existing) return { org: existing, created: false };

  const org = await models.OpenSourceOrg.create({ name: trimmedName, url: normUrl, createdBy: userId });
  return { org, created: true };
}

module.exports = { list, findOrCreate };
