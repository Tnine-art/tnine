const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');
const { prisma } = require('../db');
const { config } = require('../config');
const { hashPassword, verifyPassword, randomToken, tokenHash } = require('../lib/security');
const { ApiError, asyncRoute, parseCookies } = require('../lib/http');
const { authenticate } = require('../middleware/auth');
const { sendPasswordResetEmail, sendPasswordChangedEmail } = require('../services/email');

const router = express.Router();
const credentials = z.object({ email: z.email().transform(value => value.trim().toLowerCase()), password: z.string().min(8).max(128) });
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().transform(value => value.trim().toLowerCase()),
  password: z.string().min(12).max(128)
});
const forgotSchema = z.object({ email: z.email().transform(value => value.trim().toLowerCase()) });
const resetSchema = z.object({ token: z.string().min(32).max(256), password: z.string().min(12).max(128) });
const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.union([z.string().trim().regex(/^0[789][01]\d{8}$/, 'Enter a valid Nigerian phone number.'), z.literal('')]).optional()
});
const changePasswordSchema = z.object({ currentPassword: z.string().min(8).max(128), newPassword: z.string().min(12).max(128) });
const resetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false });

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

router.post('/forgot-password', resetLimiter, asyncRoute(async (req, res) => {
  const { email } = forgotSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const rawToken = randomToken(32);
    const record = await prisma.passwordResetToken.create({
      data: {
        userId: user.id, tokenHash: tokenHash(rawToken), requestedIp: req.ip,
        expiresAt: new Date(Date.now() + config.passwordResetTtlMinutes * 60 * 1000)
      }
    });
    try {
      await sendPasswordResetEmail(user, rawToken);
      await prisma.auditLog.create({ data: { action: 'PASSWORD_RESET_REQUESTED', entityType: 'User', entityId: user.id, ipAddress: req.ip } });
    } catch (error) {
      await prisma.passwordResetToken.delete({ where: { id: record.id } }).catch(() => {});
      console.error('Password reset email failed:', error);
    }
  }
  res.status(202).json({ message: 'If an account exists for that email, a reset link has been sent.' });
}));

router.post('/reset-password', resetLimiter, asyncRoute(async (req, res) => {
  const data = resetSchema.parse(req.body);
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash: tokenHash(data.token) }, include: { user: true } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) throw new ApiError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired.');
  const passwordHash = await hashPassword(data.password);
  await prisma.$transaction(async tx => {
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: resetToken.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new ApiError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired.');
    await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: resetToken.userId } });
    await tx.passwordResetToken.updateMany({ where: { userId: resetToken.userId, usedAt: null }, data: { usedAt: new Date() } });
    await tx.auditLog.create({ data: { action: 'PASSWORD_RESET_COMPLETED', entityType: 'User', entityId: resetToken.userId, ipAddress: req.ip } });
  });
  sendPasswordChangedEmail(resetToken.user).catch(error => console.error('Password change notification failed:', error));
  res.status(204).end();
}));

router.post('/logout', asyncRoute(async (req, res) => {
  const token = parseCookies(req.headers.cookie)[config.cookieName];
  if (token) await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  res.clearCookie(config.cookieName, { path: '/' }); res.status(204).end();
}));

router.get('/me', authenticate, (req, res) => res.json({ user: { id: req.user.id, name: req.user.name, email: req.user.email, phone: req.user.phone, role: req.user.role, createdAt: req.user.createdAt } }));
router.patch('/profile', authenticate, asyncRoute(async (req, res) => {
  const data = profileSchema.parse(req.body), phone = data.phone || null;
  if (phone) {
    const owner = await prisma.user.findUnique({ where: { phone } });
    if (owner && owner.id !== req.user.id) throw new ApiError(409, 'PHONE_EXISTS', 'This phone number is already linked to another account.');
  }
  const user = await prisma.$transaction(async tx => {
    const updated = await tx.user.update({ where: { id: req.user.id }, data: { name: data.name, phone } });
    await tx.virtualAccount.updateMany({ where: { userId: updated.id, provider: 'sandbox' }, data: { accountName: `PAYPOINT DEMO / ${updated.name.toUpperCase()}` } });
    await tx.auditLog.create({ data: { actorId: updated.id, action: 'PROFILE_UPDATED', entityType: 'User', entityId: updated.id, ipAddress: req.ip } });
    return updated;
  });
  res.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, createdAt: user.createdAt } });
}));
router.post('/change-password', resetLimiter, authenticate, asyncRoute(async (req, res) => {
  const data = changePasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!(await verifyPassword(data.currentPassword, user.passwordHash))) throw new ApiError(401, 'INVALID_PASSWORD', 'Your current password is incorrect.');
  if (await verifyPassword(data.newPassword, user.passwordHash)) throw new ApiError(400, 'PASSWORD_UNCHANGED', 'Choose a new password that is different from your current password.');
  const passwordHash = await hashPassword(data.newPassword);
  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: user.id, id: { not: req.session.id } } });
    await tx.auditLog.create({ data: { actorId: user.id, action: 'PASSWORD_CHANGED', entityType: 'User', entityId: user.id, ipAddress: req.ip } });
  });
  sendPasswordChangedEmail(user).catch(error => console.error('Password change notification failed:', error));
  res.status(204).end();
}));
module.exports = { authRouter: router };
