const crypto = require('crypto');

/**
 * The public identity of an issued credential.
 *
 * Shaped like the codes Coursera and Credly print — twelve opaque characters,
 * no separators, safe to read aloud, paste into a CV or type into the verify
 * page. Deliberately NOT sequential: a running number tells the world how many
 * certificates an organisation has ever issued, and lets anyone guess a
 * neighbour's credential by adding one.
 *
 * The alphabet drops 0/O and 1/I/L, the characters people transcribe wrongly
 * from a printed certificate. Thirty symbols over twelve places is about
 * 5.3 × 10^17 codes: at a million certificates the chance of any collision at
 * all is roughly one in a billion, and the unique index catches even that.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 12;

/** How many times to retry when the database rejects a number as taken. */
const MAX_ATTEMPTS = 5;

/**
 * One certificate number.
 *
 * Rejection sampling rather than `byte % 30`: 256 is not a multiple of 30, so
 * the modulo would make the first six symbols slightly likelier than the rest.
 * That bias costs real entropy, and entropy is the only thing stopping someone
 * guessing a credential.
 */
function generateCertificateNumber() {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let out = '';
  while (out.length < LENGTH) {
    const bytes = crypto.randomBytes(LENGTH);
    for (let i = 0; i < bytes.length && out.length < LENGTH; i += 1) {
      if (bytes[i] < max) out += ALPHABET[bytes[i] % ALPHABET.length];
    }
  }
  return out;
}

/** Is this a well-formed certificate number? Used to reject junk before a lookup. */
function isCertificateNumber(value) {
  if (typeof value !== 'string') return false;
  const normalized = normalizeCertificateNumber(value);
  return normalized.length === LENGTH && [...normalized].every((c) => ALPHABET.includes(c));
}

/**
 * What somebody typed, as the number we stored.
 *
 * Upper-cases and drops the spaces and dashes people add when copying off a
 * printed certificate. Deliberately nothing more.
 *
 * It is tempting to also "repair" the ambiguous characters — read an O as a 0,
 * an l as a 1 — but there is no correct repair to make. The alphabet excludes
 * 0/O and 1/I/L precisely so a stored number can never contain them, which
 * means a typed O is a MISREAD of some other character and we cannot know
 * which. Guessing would resolve one person's code to somebody else's
 * credential, which is far worse than telling them the number was not found.
 */
function normalizeCertificateNumber(value) {
  return String(value || '').toUpperCase().replace(/[\s-]/g, '');
}

module.exports = {
  ALPHABET,
  LENGTH,
  MAX_ATTEMPTS,
  generateCertificateNumber,
  isCertificateNumber,
  normalizeCertificateNumber
};
