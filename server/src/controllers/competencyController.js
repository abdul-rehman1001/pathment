const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const competencyService = require('../services/competencyService');

/**
 * GET /api/competencies
 *
 * Seeds a usable rubric on the first read. A workspace that has to invent
 * five competencies before it can score anybody will score nobody, and the
 * first live discussion is exactly the wrong moment to be writing a rubric.
 */
const list = catchAsync(async (req, res) => {
  const competencies = await competencyService.ensureDefaults(req.user?.id || null);
  res.status(200).json(successResponse('Competencies', { competencies }));
});

/** POST /api/competencies  { name, description? } */
const create = catchAsync(async (req, res) => {
  const competency = await competencyService.create(req.body || {}, req.user.id);
  res.status(201).json(successResponse('Competency added', { competency }, 201));
});

/** PATCH /api/competencies/:id  { name?, description?, active?, position? } */
const update = catchAsync(async (req, res) => {
  const competency = await competencyService.update(req.params.id, req.body || {});
  res.status(200).json(successResponse('Competency updated', { competency }));
});

/** DELETE /api/competencies/:id — retires it; scores already given stand. */
const retire = catchAsync(async (req, res) => {
  const competency = await competencyService.retire(req.params.id);
  res.status(200).json(successResponse('Competency retired', { competency }));
});

/** GET /api/competencies/standing?menteeIds=a,b,c */
const standing = catchAsync(async (req, res) => {
  const ids = String(req.query.menteeIds || '').split(',').map((v) => v.trim()).filter(Boolean);
  const map = await competencyService.standingFor(ids);
  res.status(200).json(successResponse('Competency standing', {
    standing: Object.fromEntries(map),
  }));
});

module.exports = { list, create, update, retire, standing };
