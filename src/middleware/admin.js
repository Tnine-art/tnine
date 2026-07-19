const { ApiError } = require('../lib/http');

function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'ADMIN') return next(new ApiError(403, 'ADMIN_REQUIRED', 'Administrator access is required.'));
  next();
}
module.exports = { requireAdmin };
