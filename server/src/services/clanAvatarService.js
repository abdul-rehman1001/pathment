const { models } = require('../db');
const authz = require('./authzService');
const { ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const { PERMISSIONS } = require('../config/permissions');

const MAX_BYTES = 1 * 1024 * 1024; // 1 MB
const ALLOWED_MIME = ['image/png', 'image/jpeg'];
const FOLDER = 'pathment/clan-avatars';

/**
 * Who may upload / change / remove a clan photo:
 * - Org/program admins (clan.manage_members at org/program scope)
 * - The clan’s lead mentor (always)
 * - Co-mentors who hold `clan.avatar` (default on; lead can deny via permissions UI)
 */
async function editableClan(id, user) {
  const clan = await models.Clan.findByPk(id);
  if (!clan) throw new NotFoundError('Clan not found');

  const resource = { clanId: id, programId: clan.programId };

  const adminAssignments = (await authz.getAssignments(user)).filter((a) =>
    ['org', 'program'].includes(a.scopeType)
  );
  if (
    await authz.can(user, PERMISSIONS.CLAN_MANAGE_MEMBERS, resource, {
      assignments: adminAssignments,
    })
  ) {
    return clan;
  }

  const leadMembership = await models.ClanMembership.findOne({
    where: { clanId: id, userId: user.id, role: 'lead_mentor', status: 'active' },
    attributes: ['id'],
  });
  if (leadMembership || clan.leadMentorId === user.id) return clan;

  if (await authz.can(user, PERMISSIONS.CLAN_AVATAR, resource)) return clan;

  throw new ForbiddenError('You cannot change this clan photo');
}

function assertImageFile(file) {
  if (!file || !ALLOWED_MIME.includes(file.mimetype)) {
    throw new ValidationError('Choose a PNG or JPG image up to 1 MB');
  }
  if (file.size > MAX_BYTES) {
    throw new ValidationError('Choose a PNG or JPG image up to 1 MB');
  }
}

function assertAvatarUrl(url) {
  const s = String(url || '').trim();
  if (!/^https?:\/\//i.test(s)) {
    throw new ValidationError('A valid image URL is required');
  }
  return s;
}

/** Upload only — returns { url, fileName, fileSizeBytes }. Does not touch the clan row. */
async function uploadAvatarFile(id, user, file) {
  await editableClan(id, user);
  assertImageFile(file);
  const result = await uploadToCloudinary(file.buffer, FOLDER, 'image');
  const url = result.secure_url || result.url;
  if (!url) throw new ValidationError('Could not upload the file');
  return {
    url,
    fileName: file.originalname || 'clan-avatar.jpg',
    fileSizeBytes: file.size || 0,
  };
}

/** Persist a previously uploaded URL on the clan (add or change). */
async function setAvatarUrl(id, user, avatarUrl) {
  const clan = await editableClan(id, user);
  const url = assertAvatarUrl(avatarUrl);
  await clan.update({ avatarUrl: url });
  return { avatarUrl: clan.avatarUrl };
}

async function removeAvatar(id, user) {
  const clan = await editableClan(id, user);
  await clan.update({ avatarUrl: null });
  return { avatarUrl: null };
}

async function canEditAvatar(id, user) {
  try {
    await editableClan(id, user);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  editableClan,
  uploadAvatarFile,
  setAvatarUrl,
  removeAvatar,
  canEditAvatar,
  MAX_BYTES,
};
