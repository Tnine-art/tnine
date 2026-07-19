const express = require('express');
const { prisma } = require('../db');
const { authenticate } = require('../middleware/auth');
const { asyncRoute } = require('../lib/http');
const router = express.Router();

router.use(authenticate);
router.get('/', asyncRoute(async (req, res) => {
  const account = await prisma.ledgerAccount.findUnique({ where: { userId: req.user.id } });
  res.json({ balanceKobo: account.balanceKobo, currency: 'NGN' });
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
module.exports = { walletRouter: router };
