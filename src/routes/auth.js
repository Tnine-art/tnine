const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db');
const { config } = require('../config');
const { hashPassword, verifyPassword, randomToken, tokenHash } = require('../lib/security');
const { ApiError, asyncRoute, parseCookies } = require('../lib/http');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const credentials = z.object({ email: z.email().transform(value => value.trim().toLowerCase()), password: z.string().min(8).max(128) });
const registerSchema = credentials.extend({ name: z.string().trim().min(2).max(80) });

function setSessionCookie(res, token) {
  res.cookie(config.cookieName, token, { httpOnly: true, secure: config.env === 'production', sameSite: 'lax', path: '/', maxAge: config.sessionTtlDays * 86400000 });
}
async function createSession(userId, res) {
  const token = randomToken();
  await prisma.session.create({ data: { tokenHash: tokenHash(token), userId, expiresAt: new Date(Date.now() + config.sessionTtlDays * 86400000) } });
  setSessionCookie(res, token);
}

router.post('/register', asyncRoute(async (req, res) => {
  const data = registerSchema.parse(req.body);
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw new ApiError(409, 'EMAIL_EXISTS', 'An account already exists for this email.');
  const user = await prisma.$transaction(async tx => {
    const created = await tx.user.create({ data: { name: data.name, email: data.email, passwordHash: await hashPassword(data.password) } });
    await tx.ledgerAccount.create({ data: { type: 'USER_WALLET', name: `${created.name} wallet`, userId: created.id } });
    return created;
  });
  await createSession(user.id, res);
  res.status(201).json({ user: { id: user.id, name: user.name, email: user.email } });
}));

router.post('/login', asyncRoute(async (req, res) => {
  const data = credentials.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user || !(await verifyPassword(data.password, user.passwordHash))) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  await createSession(user.id, res);
  res.json({ user: { id: user.id, name: user.name, email: user.email } });
}));

router.post('/logout', asyncRoute(async (req, res) => {
  const token = parseCookies(req.headers.cookie)[config.cookieName];
  if (token) await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  res.clearCookie(config.cookieName, { path: '/' }); res.status(204).end();
}));

router.get('/me', authenticate, (req, res) => res.json({ user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role } }));
module.exports = { authRouter: router };
