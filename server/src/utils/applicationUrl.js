/** CLIENT_URL is a CORS allow-list; only a single origin is valid in links. */
module.exports = function applicationUrl(fallback = 'https://app.pathment.me') {
  const configured = process.env.APP_URL || (process.env.CLIENT_URL || '').split(',')[0].trim() || fallback;
  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol) || url.hostname.includes('*')) {
    throw new Error('APP_URL must be one HTTP(S) application origin');
  }
  return url.origin;
};
