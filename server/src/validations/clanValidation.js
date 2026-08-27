const Joi = require('joi');

/**
 * Clan query/body validation. `listQuery` caps pagination server-side so a
 * crafted `?limit=10000` can never dump the whole table — it 400s instead.
 */
module.exports = {
  listQuery: Joi.object({
    programId: Joi.string().uuid().optional().allow(null, ''),
    status: Joi.string().valid('active', 'inactive', 'archived').optional().allow(null, ''),
    search: Joi.string().trim().max(120).optional().allow(''),
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional()
  }),

  idParams: Joi.object({
    id: Joi.string().uuid().required()
  }),

  publicJoinAccess: Joi.object({
    allowed: Joi.boolean().required()
  }),

  joinRequestQuery: Joi.object({
    status: Joi.string().valid('pending', 'approved', 'rejected', 'cancelled').optional()
  }),

  joinRequestParams: Joi.object({
    id: Joi.string().uuid().required(),
    requestId: Joi.string().uuid().required()
  }),

  rejectJoinRequest: Joi.object({
    note: Joi.string().trim().max(2000).allow('', null).optional()
  }),

  publicJoinRequestBody: Joi.object({
    message: Joi.string().trim().max(2000).allow('', null).optional()
  })
};
