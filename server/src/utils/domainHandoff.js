const { createHash, timingSafeEqual } = require('crypto');
const { AuthorizationError, ValidationError } = require('./errors/errorTypes');
const PROOF = /^[A-Za-z0-9_-]{43}$/;

function assertHandoffOrigin(req, consume = false) {
  const expected = consume
    ? new URL(process.env.APP_URL || 'https://app.pathment.me').origin
    : `https://${req.organization?.slug}.pathment.me`;
  if (req.headers.origin !== expected) throw new AuthorizationError('Invalid workspace transfer origin');
}

function validateChallenge(challenge) {
  if (typeof challenge !== 'string' || !PROOF.test(challenge)) throw new ValidationError('Invalid transfer challenge');
}

function verifyChallenge(verifier, challenge) {
  validateChallenge(challenge); // Old unbound codes fail closed.
  if (typeof verifier !== 'string' || !PROOF.test(verifier)) throw new ValidationError('Invalid transfer verifier');
  const actual = createHash('sha256').update(verifier).digest('base64url');
  if (!timingSafeEqual(Buffer.from(actual), Buffer.from(challenge))) throw new ValidationError('Invalid transfer verifier');
}
module.exports = { assertHandoffOrigin, validateChallenge, verifyChallenge };
