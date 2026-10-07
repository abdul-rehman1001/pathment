const organizationService = require('./organizationService');
const { models } = require('../db');
const { ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const {
  uploadToCloudinary,
  deleteFromCloudinary,
  extractPublicId,
} = require('../utils/cloudinaryUpload');

const FOLDER = 'pathment/org-logos';
const ALLOWED = ['image/png', 'image/jpeg'];
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Workspace logos are owner/admin only and plan-gated (customBranding).
 * Stored as a square Cloudinary asset; clients receive a CDN thumb on serialize.
 */
async function assertCanEditLogo(userId, organizationId) {
  const membership = await organizationService.assertMembership(userId, organizationId);
  if (!['owner', 'admin'].includes(membership.role)) {
    throw new ForbiddenError('Organization admin access is required');
  }
  if (!(await organizationService.entitlement(organizationId, 'customBranding'))) {
    throw new ForbiddenError('Custom branding is available on the Growth plan and above');
  }
  const organization = await models.Organization.findByPk(organizationId);
  if (!organization) throw new NotFoundError('Organization not found');
  return { organization, membership };
}

async function cleanupPrevious(url) {
  if (!url || !url.includes('res.cloudinary.com') || !url.includes(FOLDER)) return;
  deleteFromCloudinary(extractPublicId(url), 'image').catch(() => {});
}

async function setLogo(userId, organizationId, file) {
  const { organization, membership } = await assertCanEditLogo(userId, organizationId);
  if (!file || !ALLOWED.includes(file.mimetype) || file.size > MAX_BYTES) {
    throw new ValidationError('Choose a PNG or JPG image up to 5 MB');
  }
  const previous = organization.logoUrl;
  const result = await uploadToCloudinary(file.buffer, FOLDER, 'image');
  organization.logoUrl = result.secure_url;
  await organization.save();
  cleanupPrevious(previous);
  return organizationService.serializeForMembership(organization, membership);
}

async function removeLogo(userId, organizationId) {
  const { organization, membership } = await assertCanEditLogo(userId, organizationId);
  const previous = organization.logoUrl;
  organization.logoUrl = null;
  await organization.save();
  cleanupPrevious(previous);
  return organizationService.serializeForMembership(organization, membership);
}

module.exports = { setLogo, removeLogo, assertCanEditLogo };
