/**
 * Every link we put in an email.
 *
 * They all go through one host, `LINK_URL`, because Android verifies app links
 * per host. If invites came from devweekends.pathment.me and resets from
 * microtechx.pathment.me, each new customer would need a new mobile build
 * before their links could open the app. Through one host, a new customer costs
 * nothing in the app: the tenant travels in the path.
 *
 * With LINK_URL unset this returns exactly what it always returned, so the code
 * can ship before the DNS does.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{1,30}$/;

const stripSlash = (value) => String(value || '').replace(/\/$/, '');

const clientUrl = () => stripSlash(process.env.CLIENT_URL || 'http://localhost:3000');
const linkHost = () => stripSlash(process.env.LINK_URL || '');

/**
 * Which customer this deployment belongs to.
 *
 * Set TENANT_SLUG explicitly in production. The fallback reads the first label
 * of CLIENT_URL, which is right for every deployment that follows the
 * <customer>.pathment.me convention and stops localhost from producing
 * something that looks like a real tenant.
 */
function tenantSlug() {
  const explicit = String(process.env.TENANT_SLUG || '').trim().toLowerCase();
  if (SLUG.test(explicit)) return explicit;

  try {
    const label = new URL(clientUrl()).hostname.split('.')[0].toLowerCase();
    if (SLUG.test(label) && label !== 'localhost') return label;
  } catch {
    // A malformed CLIENT_URL is not worth throwing over inside an email.
  }

  return 'app';
}

function through(kind, token, directPath) {
  const host = linkHost();
  if (!host || !token) return `${clientUrl()}${directPath}`;

  return `${host}/${kind}/${tenantSlug()}/${encodeURIComponent(token)}`;
}

/** The registration invite. Single use, and the only way to create an account. */
const inviteLink = (token) =>
  through('i', token, `/register?invite=${encodeURIComponent(token || '')}`);

const resetLink = (token) =>
  through('r', token, `/reset-password?token=${encodeURIComponent(token || '')}`);

const verifyLink = (token) =>
  through('v', token, `/verify-email?token=${encodeURIComponent(token || '')}`);

/** A one-time sign-in link. Fifteen minutes, single use, straight into a session. */
const signInLink = (token) =>
  through('m', token, `/sign-in?link=${encodeURIComponent(token || '')}`);

/**
 * Where a notification points, made absolute.
 *
 * `actionUrl` is a relative path because the bell and the mobile app both want
 * it that way. An email does not: a relative href has no base to resolve
 * against, which is why the button in every task, deadline and approval email
 * has been dead. Absolute URLs are passed through, since a few callers already
 * build their own.
 */
function pageLink(path) {
  const value = typeof path === 'string' ? path.trim() : '';
  if (/^https?:\/\//i.test(value)) return value;

  // A single leading slash and no more, so `//evil.com` cannot smuggle a host in.
  const safe = value.startsWith('/') && !value.startsWith('//') ? value : '/dashboard';

  const host = linkHost();
  if (!host) return `${clientUrl()}${safe}`;

  return `${host}/g/${tenantSlug()}?to=${encodeURIComponent(safe)}`;
}

module.exports = { inviteLink, resetLink, verifyLink, signInLink, pageLink, tenantSlug };
