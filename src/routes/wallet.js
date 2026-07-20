const express = require('express');
const crypto = require('node:crypto');
const { z } = require('zod');
const { prisma } = require('../db');
const { config } = require('../config');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncRoute } = require('../lib/http');
const { idempotentReference } = require('../lib/idempotency');
const router = express.Router();
const transferSchema = z.object({ recipientEmail: z.email().transform(value => value.trim().toLowerCase()), amountKobo: z.int().min(10000).max(100000000), note: z.string().trim().max(80).optional() });

router.use(authenticate);
router.get('/', asyncRoute(async (req, res) => {
  const account = await prisma.ledgerAccount.findUnique({ where: { userId: req.user.id } });
  res.json({ balanceKobo: account.balanceKobo, currency: 'NGN' });
}));
router.get('/virtual-account', asyncRoute(async (req, res) => {
  let account = await prisma.virtualAccount.findUnique({ where: { userId: req.user.id } });
  if (!account) {
    if (config.liveMode) throw new ApiError(503, 'VIRTUAL_ACCOUNT_UNAVAILABLE', 'Virtual account setup is not yet available for this account.');
    for (let attempt = 0; attempt < 5 && !account; attempt += 1) {
      const accountNumber = `90${crypto.randomInt(0, 100000000).toString().padStart(8, '0')}`;
      try {
        account = await prisma.virtualAccount.create({
          data: {
            userId: req.user.id, provider: 'sandbox', bankName: 'PayPoint Demo Bank',
            accountName: `PAYPOINT DEMO / ${req.user.name.toUpperCase()}`, accountNumber
          }
        });
      } catch (error) {
        if (error.code !== 'P2002') throw error;
        account = await prisma.virtualAccount.findUnique({ where: { userId: req.user.id } });
      }
    }
    if (!account) throw new ApiError(503, 'VIRTUAL_ACCOUNT_UNAVAILABLE', 'Could not prepare a demo virtual account. Please try again.');
  }
  res.json({
    virtualAccount: {
      bankName: account.bankName, accountName: account.accountName, accountNumber: account.accountNumber,
      currency: account.currency, active: account.active, environment: config.liveMode ? 'live' : 'sandbox',
      canReceiveRealMoney: config.liveMode && account.provider !== 'sandbox'
    }
  });
}));
router.get('/transactions', asyncRoute(async (req, res) => {
  const account = await prisma.ledgerAccount.findUnique({ where: { userId: req.user.id } });
  const postings = await prisma.ledgerPosting.findMany({
    where: { accountId: account.id }, include: { transaction: true }, orderBy: { createdAt: 'desc' }, take: Math.min(Number(req.query.limit) || 20, 100)
  });
  res.json({ transactions: postings.map(item => ({
    id: item.transaction.id, reference: item.transaction.reference, type: item.transaction.type,
    status: item.transaction.status, description: item.transaction.description, amountKobo: item.amountKobo, createdAt: item.createdAt
  })) });
}));
router.post('/transfers', asyncRoute(async (req, res) => {
  const data = transferSchema.parse(req.body);
  if (data.recipientEmail === req.user.email) throw new ApiError(400, 'SELF_TRANSFER', 'Choose another PayPoint account as the recipient.');
  const recipient = await prisma.user.findUnique({ where: { email: data.recipientEmail }, include: { account: true } });
  if (!recipient?.account) throw new ApiError(404, 'RECIPIENT_NOT_FOUND', 'No PayPoint account was found for that email address.');
  const reference = idempotentReference(req, 'trf'), amount = BigInt(data.amountKobo);
  const transaction = await prisma.$transaction(async tx => {
    const existing = await tx.ledgerTransaction.findUnique({ where: { reference }, include: { postings: true } });
    if (existing) return existing;
    const debited = await tx.ledgerAccount.updateMany({ where: { id: req.user.account.id, balanceKobo: { gte: amount } }, data: { balanceKobo: { decrement: amount } } });
    if (debited.count !== 1) throw new ApiError(409, 'INSUFFICIENT_BALANCE', 'Your wallet balance is too low.');
    await tx.ledgerAccount.update({ where: { id: recipient.account.id }, data: { balanceKobo: { increment: amount } } });
    return tx.ledgerTransaction.create({
      data: {
        reference, type: 'TRANSFER', status: 'SUCCESSFUL', description: `Transfer to ${recipient.name}`,
        metadata: JSON.stringify({ senderId: req.user.id, recipientId: recipient.id, note: data.note || null }),
        postings: { create: [{ accountId: req.user.account.id, amountKobo: -amount }, { accountId: recipient.account.id, amountKobo: amount }] }
      }, include: { postings: true }
    });
  });
  res.status(201).json({ transfer: { reference: transaction.reference, recipient: { name: recipient.name }, amountKobo: data.amountKobo, status: transaction.status } });
}));
module.exports = { walletRouter: router };
