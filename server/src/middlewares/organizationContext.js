const { catchAsync } = require('./errorHandler');
const organizationService = require('../services/organizationService');
const { setRequestOrganization } = require('../utils/auditContext');
const { ValidationError } = require('../utils/errors/errorTypes');
const AppError = require('../utils/errors/AppError');

function originHostname(req) {
  try { return new URL(req.headers.origin).hostname; } catch { return null; }
}

/** Resolve workspace before authentication; authentication validates membership. */
module.exports = catchAsync(async (req, _res, next) => {
  // Public catalog and health checks do not require a selected workspace.
  if (['/api/organizations/plans', '/api/health', '/'].includes(req.path)) return next();
  const header = req.headers['x-pathment-workspace'];
  const requested = organizationService.normalizeSlug(header);
  if (header !== undefined && !requested) throw new ValidationError('Invalid workspace identifier');
  let organization = requested ? await organizationService.bySlug(requested) : null;
  if (requested && !organization) throw new AppError('The selected workspace was not found', 404, 'WORKSPACE_NOT_FOUND');
  if (!organization) organization = await organizationService.byHostname(originHostname(req) || req.hostname);
  if (!organization) organization = await organizationService.bySlug(organizationService.defaultSlug());
  if (!organization) throw new AppError('The default workspace has not been initialized. Contact your administrator.', 503, 'WORKSPACE_NOT_INITIALIZED');
  organizationService.assertWorkspaceAvailable(organization);
  if (organization) {
    req.organization = organization;
    req.organizationId = organization.id;
    setRequestOrganization(organization.id, organization.slug);
  }
  next();
});
