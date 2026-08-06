const { models } = require('../db');

/**
 * insightService - mentor-authored observations about a mentee (personality
 * reads, issue flags, strengths). Small enough to live here; cohortService
 * consumes the reads rather than querying the schema itself.
 */
class InsightService {
  async getInsightsByMentee(menteeId) {
    return models.Insight.findAll({
      where: { menteeId },
      order: [['created_at', 'DESC']],
      include: [{ model: models.User, as: 'author', attributes: ['firstName', 'lastName'] }]
    });
  }
}

module.exports = new InsightService();
