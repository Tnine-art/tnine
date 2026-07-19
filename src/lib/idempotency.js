const crypto = require('node:crypto');
const { ApiError } = require('./http');

function idempotentReference(req, prefix) {
  const key = req.get('Idempotency-Key');
  if (!key || key.length < 8 || key.length > 128) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Provide a unique Idempotency-Key header.');
  const digest = crypto.createHash('sha256').update(`${req.user.id}:${key}`).digest('hex').slice(0, 24);
  return `${prefix}_${digest}`;
}
module.exports = { idempotentReference };
