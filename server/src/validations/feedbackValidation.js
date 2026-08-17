const Joi = require('joi');

/**
 * Feedback reports had no schema at all. The route accepted whatever arrived and
 * the service trimmed it into shape afterwards, which meant a client could post
 * a five thousand character title and be told nothing, and a typo in a field
 * name failed silently as a missing value rather than loudly as a bad request.
 *
 * These describe the same limits the service already enforces, so nothing new is
 * refused. What changes is that a client is now told which field it got wrong.
 *
 * `create` runs over a multipart body, so every value arrives as a string:
 * nothing here may expect a number or a boolean.
 */

const PLATFORMS = ['web', 'android', 'ios'];
const TYPES = ['bug', 'suggestion', 'other'];
const STATUSES = ['open', 'in_review', 'planned', 'fixed', 'added', 'declined'];
const PRIORITIES = ['low', 'normal', 'high'];

const feedbackSchemas = {
  create: Joi.object({
    title: Joi.string().trim().min(3).max(200).required().messages({
      'string.empty': 'Give it a short title so it can be found again',
      'string.min': 'A few more words, so somebody can tell reports apart',
      'string.max': 'Titles stop at 200 characters. Put the detail below it',
      'any.required': 'Give it a short title so it can be found again'
    }),
    type: Joi.string().valid(...TYPES).default('bug'),
    description: Joi.string().trim().allow('').max(5000).messages({
      'string.max': 'That is longer than 5000 characters. Trim it or attach a file'
    }),

    // Where it happened. Optional because an older web build will never send it
    // and being turned away over a field nobody asked for is worse than being
    // filed under a sniffed platform.
    platform: Joi.string().valid(...PLATFORMS),
    appVersion: Joi.string().trim().max(32),
    device: Joi.string().trim().max(120),
    pageUrl: Joi.string().trim().max(500).allow(''),
    userAgent: Joi.string().trim().max(500).allow('')
  }),

  /** Admin triage. Every field optional: this is a patch, not a replacement. */
  updateStatus: Joi.object({
    status: Joi.string().valid(...STATUSES),
    priority: Joi.string().valid(...PRIORITIES),
    resolutionNote: Joi.string().trim().allow('').max(5000)
  })
    .min(1)
    .messages({ 'object.min': 'Nothing to change' }),

  listQuery: Joi.object({
    status: Joi.string().valid(...STATUSES),
    type: Joi.string().valid(...TYPES),
    platform: Joi.string().valid(...PLATFORMS),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100)
  })
};

module.exports = { feedbackSchemas, PLATFORMS, TYPES, STATUSES, PRIORITIES };
