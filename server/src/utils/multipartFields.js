/**
 * Reading fields off a multipart request.
 *
 * Multipart carries repeated fields, not typed ones. Everything arrives as a
 * string, a field sent twice arrives as an array of two, and a field not sent
 * at all arrives as undefined. Nothing coerces it back on the way in, so a
 * handler that treats `req.body` the way it treats a JSON body is reading a
 * shape that only happens to be right some of the time.
 *
 * That is not theoretical. `submissionUrls` is a Postgres text[]. Sequelize
 * stringifies an array by mapping over it, so a submission carrying exactly one
 * link handed it a bare string and threw "values.map is not a function" — a 500
 * on very nearly every submission sent from the phone, because a mentee
 * attaches one link, not two.
 *
 * JSON callers already send the right types and pass through untouched.
 */

/** A repeated text field as an array of non-empty trimmed strings. */
function toStringList(value) {
  const list = value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

  return list
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
}

/** A checkbox. "false" is a string, and a truthy one, so `||` is not enough. */
function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  return value === 'true' || value === '1';
}

/**
 * A numeric field, or null when it is absent or not a number.
 *
 * An empty field is absent, not nought. `Number('')` is 0 and finite, so a form
 * submitted with the hours box left blank would otherwise record nought hours
 * rather than recording nothing.
 */
function toNumber(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

module.exports = { toStringList, toBoolean, toNumber };
