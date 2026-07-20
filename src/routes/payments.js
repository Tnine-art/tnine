const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db');
const { config } = require('../config');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncRoute } = require('../lib/http');
const { idempotentReference } = require('../lib/idempotency');
const { postBalancedTransaction } = require('../services/ledger');
const { paymentProvider } = require('../providers/payments');
const router = express.Router();
const amountSchema = z.object({ amountKobo: z.int().min(10000).max(100000000) });

async function completePayment(reference, providerReference) {
  const payment = await prisma.payment.findUnique({ where: { reference }, include: { user: { include: { account: true } } } });
  if (!payment) throw new ApiError(404, 'PAYMENT_NOT_FOUND', 'Payment was not found.');
  if (payment.status === 'SUCCESSFUL') return payment;
  const ledger = await postBalancedTransaction({
    reference: `fund_${payment.reference}`, type: 'WALLET_FUNDING', description: 'Wallet funding', userAccountId: payment.user.account.id,
    amountKobo: payment.amountKobo, direction: 'credit', counterType: 'GATEWAY_CLEARING', counterName: 'Payment gateway clearing', metadata: { paymentReference: payment.reference }
  });
  return prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCESSFUL', providerRef: providerReference, ledgerTransactionId: ledger.id } });
}

router.post('/initialize', authenticate, asyncRoute(async (req, res) => {
  const { amountKobo } = amountSchema.parse(req.body);
  const reference = idempotentReference(req, 'pay');
  const existing = await prisma.payment.findUnique({ where: { reference } });
  if (existing) return res.json({ payment: existing, duplicate: true });
  const payment = await prisma.payment.create({ data: { reference, userId: req.user.id, amountKobo: BigInt(amountKobo), provider: config.paymentProvider } });
  try {
    const initialized = await paymentProvider().initialize({ reference, amountKobo, email: req.user.email });
    await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: initialized.providerReference } });
    res.status(201).json({ payment: { reference, amountKobo, status: payment.status }, checkoutUrl: initialized.checkoutUrl });
  } catch (error) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } }); throw error;
  }
}));

router.get('/mock-checkout', asyncRoute(async (req, res) => {
  if (config.paymentProvider !== 'mock' || (config.env === 'production' && config.deploymentStage !== 'sandbox')) throw new ApiError(404, 'NOT_FOUND', 'Not found.');
  const payment = await completePayment(String(req.query.reference || ''), String(req.query.reference || ''));
  res.redirect(`/dashboard.html?payment=successful&reference=${encodeURIComponent(payment.reference)}`);
}));

router.post('/webhooks/paystack', asyncRoute(async (req, res) => {
  if (config.paymentProvider !== 'paystack') return res.status(204).end();
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
  if (!paymentProvider().verifyWebhook(rawBody, req.get('x-paystack-signature'))) throw new ApiError(401, 'INVALID_SIGNATURE', 'Invalid webhook signature.');
  if (req.body.event === 'charge.success') {
    const data = req.body.data;
    const payment = await prisma.payment.findUnique({ where: { reference: data.reference } });
    if (payment && payment.amountKobo === BigInt(data.amount) && data.status === 'success') await completePayment(payment.reference, String(data.id));
  }
  res.status(200).json({ received: true });
}));
module.exports = { paymentsRouter: router };
