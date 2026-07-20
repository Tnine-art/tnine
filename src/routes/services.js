const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db');
const { config } = require('../config');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncRoute } = require('../lib/http');
const { idempotentReference } = require('../lib/idempotency');
const { postBalancedTransaction } = require('../services/ledger');
const { vtuProvider } = require('../providers/vtu');
const { getServiceCatalog, SANDBOX_DATA_PLANS, SANDBOX_TV_PLANS } = require('../services/catalog');
const router = express.Router();
const phone = z.string().regex(/^0[789][01]\d{8}$/, 'Enter a valid Nigerian phone number.');
const airtimeSchema = z.object({ network: z.enum(['MTN', 'Airtel', 'Glo', '9mobile']), phone, amountKobo: z.int().min(5000).max(10000000) });
const dataSchema = z.object({ planCode: z.string(), phone });
const tvSchema = z.object({ planCode: z.string(), smartcardNumber: z.string().trim().regex(/^\d{6,15}$/, 'Enter a valid smartcard or IUC number.'), phone });

router.get('/plans', asyncRoute(async (_req, res) => res.json(await getServiceCatalog())));
router.use(authenticate);

async function makePurchase(req, res, details) {
  const reference = idempotentReference(req, 'ord');
  const previous = await prisma.serviceOrder.findUnique({ where: { reference } });
  if (previous) return res.json({ order: previous, duplicate: true });
  const { customerPhone: _customerPhone, serviceId: _serviceId, variationCode: _variationCode, ...orderDetails } = details;
  const order = await prisma.serviceOrder.create({ data: { reference, userId: req.user.id, provider: config.vtuProvider, status: 'PENDING', ...orderDetails, amountKobo: BigInt(details.amountKobo) } });
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
  const data = dataSchema.parse(req.body), catalog = await getServiceCatalog(), plan = catalog.plans.find(item => item.code === data.planCode);
  if (!plan) throw new ApiError(400, 'INVALID_PLAN', 'Select a valid data plan.');
  return makePurchase(req, res, { kind: 'DATA', network: plan.network, serviceId: plan.serviceId, phone: data.phone, planCode: plan.variationCode, amountKobo: plan.amountKobo, description: `${plan.network} ${plan.name} for ${data.phone}` });
}));
router.post('/tv', asyncRoute(async (req, res) => {
  const data = tvSchema.parse(req.body), catalog = await getServiceCatalog(), plan = catalog.tvPlans.find(item => item.code === data.planCode);
  if (!plan) throw new ApiError(400, 'INVALID_TV_PLAN', 'Select a valid TV subscription package.');
  return makePurchase(req, res, {
    kind: 'TV', network: plan.provider, serviceId: plan.serviceId, phone: data.smartcardNumber, planCode: plan.variationCode, amountKobo: plan.amountKobo,
    description: `${plan.name} subscription for ${data.smartcardNumber}`, customerPhone: data.phone
  });
}));
module.exports = { servicesRouter: router, PLANS: SANDBOX_DATA_PLANS, TV_PLANS: SANDBOX_TV_PLANS };
