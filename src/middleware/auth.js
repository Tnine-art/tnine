const { prisma } = require('../db');
const { config } = require('../config');
const { tokenHash } = require('../lib/security');
const { ApiError, parseCookies } = require('../lib/http');

async function authenticate(req, _res, next) {
  try {
    const token = parseCookies(req.headers.cookie)[config.cookieName];
    if (!token) throw new ApiError(401, 'AUTH_REQUIRED', 'Please log in to continue.');
    const session = await prisma.session.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: { user: { include: { account: true } } }
    });
    if (!session || session.expiresAt <= new Date()) throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired.');
    req.session = session; req.user = session.user; next();
  } catch (error) { next(error); }
}

module.exports = { authenticate };
