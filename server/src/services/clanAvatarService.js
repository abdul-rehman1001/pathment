const { models } = require('../db');
const authz = require('./authzService');
const { ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');

/**
 * Clan photos are org/program administration only.
 * Lead/co mentors of the clan can see the photo but cannot upload or change it.
 */
async function editableClan(id, user) {
  const clan = await models.Clan.findByPk(id);
  if (!clan) throw new NotFoundError('Clan not found');
  // Only organization/program administration can edit photos. Clan-scoped
  // grants (including the lead's manage-members permission) do not qualify.
  const assignments = (await authz.getAssignments(user)).filter((a) => ['org', 'program'].includes(a.scopeType));
  const admin = await authz.can(user, 'clan.manage_members', { clanId: id, programId: clan.programId }, { assignments });
  if (!admin) throw new ForbiddenError('Only an administrator can change the clan photo');
  return clan;
}

async function setAvatar(id, user, file) {
  const clan = await editableClan(id, user);
  if (!file || !['image/png', 'image/jpeg'].includes(file.mimetype) || file.size > 5 * 1024 * 1024) {
    throw new ValidationError('Choose a PNG or JPG image up to 5 MB');
  }
  const result = await uploadToCloudinary(file.buffer, 'pathment/clan-avatars', 'image');
  await clan.update({ avatarUrl: result.secure_url });
  return { avatarUrl: clan.avatarUrl };
}

async function removeAvatar(id, user) {
  const clan = await editableClan(id, user);
  await clan.update({ avatarUrl: null });
  return { avatarUrl: null };
}

module.exports = { editableClan, setAvatar, removeAvatar };
