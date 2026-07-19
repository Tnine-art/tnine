const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db');
const { config } = require('../config');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncRoute } = require('../lib/http');
const { idempotentReference } = require('../lib/idempotency');
const { postBalancedTransaction } = require('../services/ledger');
const { vtuProvider } = require('../providers/vtu');
const router = express.Router();

const PLANS = [
  { code: 'mtn-1gb-30d', network: 'MTN', name: '1GB · 30 days', amountKobo: 50000 },
  { code: 'airtel-2gb-30d', network: 'Airtel', name: '2GB · 30 days', amountKobo: 100000 },
  { code: 'glo-5gb-30d', network: 'Glo', name: '5GB · 30 days', amountKobo: 200000 },
  { code: '9mobile-1_5gb-30d', network: '9mobile', name: '1.5GB · 30 days', amountKobo: 120000 }
];
const phone = z.string().regex(/^0[789][01]\d{8}$/, 'Enter a valid Nigerian phone number.');
const airtimeSchema = z.object({ network: z.enum(['MTN', 'Airtel', 'Glo', '9mobile']), phone, amountKobo: z.int().min(5000).max(10000000) });
const dataSchema = z.object({ planCode: z.string(), phone });

router.get('/plans', (_req, res) => res.json({ plans: PLANS }));
router.use(authenticate);

async function makePurchase(req, res, details) {
  const reference = idempotentReference(req, 'ord');
  const previous = await prisma.serviceOrder.findUnique({ where: { reference } });
  if (previous) return res.json({ order: previous, duplicate: true });
  const order = await prisma.serviceOrder.create({ data: { reference, userId: req.user.id, provider: config.vtuProvider, status: 'PENDING', ...details, amountKobo: BigInt(details.amountKobo) } });
  let debit;
  try {
    debit = await postBalancedTransaction({
      reference: `debit_${reference}`, type: details.kind, description: details.description, userAccountId: req.user.account.id,
      amountKobo: details.amountKobo, direction: 'debit', counterType: 'VTU_CLEARING', counterName: 'VTU provider clearing', metadata: { orderReference: reference }
    });
    await prisma.serviceOrder.update({ where: { id: order.id }, data: { status: 'PROCESSING', ledgerTransactionId: debit.id } });
    const result = await vtuProvider().purchase({ reference, ...details });
    if (result.successful) {
      const completed = await prisma.serviceOrder.update({ where: { id: order.id }, data: { status: 'SUCCESSFUL', providerRef: result.providerReference } });
      return res.status(201).json({ order: completed });
    }
    if (result.pending) {
      const pending = await prisma.serviceOrder.update({ where: { id: order.id }, data: { status: 'PROCESSING', providerRef: result.providerReference } });
      return res.status(202).json({ order: pending });
    }
    throw new ApiError(502, 'DELIVERY_FAILED', 'The provider could not deliver this service.');
  } catch (error) {
    if (debit) {
      await postBalancedTransaction({ reference: `refund_${reference}`, type: 'REFUND', description: `Refund for ${details.description}`, userAccountId: req.user.account.id, amountKobo: details.amountKobo, direction: 'credit', counterType: 'VTU_CLEARING', counterName: 'VTU provider clearing', metadata: { orderReference: reference } });
      await prisma.serviceOrder.update({ where: { id: order.id }, data: { status: 'REFUNDED' } });
    } else await prisma.serviceOrder.update({ where: { id: order.id }, data: { status: 'FAILED' } });
    throw error;
  }
}

router.post('/airtime', asyncRoute(async (req, res) => {
  const data = airtimeSchema.parse(req.body);
  return makePurchase(req, res, { kind: 'AIRTIME', network: data.network, phone: data.phone, planCode: null, amountKobo: data.amountKobo, description: `${data.network} airtime for ${data.phone}` });
}));
router.post('/data', asyncRoute(async (req, res) => {
  const data = dataSchema.parse(req.body), plan = PLANS.find(item => item.code === data.planCode);
  if (!plan) throw new ApiError(400, 'INVALID_PLAN', 'Select a valid data plan.');
  return makePurchase(req, res, { kind: 'DATA', network: plan.network, phone: data.phone, planCode: plan.code, amountKobo: plan.amountKobo, description: `${plan.network} ${plan.name} for ${data.phone}` });
}));
module.exports = { servicesRouter: router, PLANS };
