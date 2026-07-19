const express = require('express');
const { prisma } = require('../db');
const { authenticate } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const { asyncRoute, ApiError } = require('../lib/http');
const { audit } = require('../services/audit');
const { reconcileOrder } = require('../services/reconciliation');
const router = express.Router();
router.use(authenticate, requireAdmin);

router.get('/overview', asyncRoute(async (_req, res) => {
  const [users, successfulOrders, pendingOrders, successfulPayments, paymentVolume] = await Promise.all([
    prisma.user.count({ where: { role: 'CUSTOMER' } }), prisma.serviceOrder.count({ where: { status: 'SUCCESSFUL' } }),
    prisma.serviceOrder.count({ where: { status: 'PROCESSING' } }), prisma.payment.count({ where: { status: 'SUCCESSFUL' } }),
    prisma.payment.aggregate({ where: { status: 'SUCCESSFUL' }, _sum: { amountKobo: true } })
  ]);
  res.json({ users, successfulOrders, pendingOrders, successfulPayments, paymentVolumeKobo: paymentVolume._sum.amountKobo || 0 });
}));
router.get('/users', asyncRoute(async (_req, res) => {
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, createdAt: true, account: { select: { balanceKobo: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ users });
}));
router.get('/orders', asyncRoute(async (req, res) => {
  const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
  if (status && !['PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'REFUNDED'].includes(status)) throw new ApiError(400, 'INVALID_STATUS', 'Invalid order status filter.');
  const orders = await prisma.serviceOrder.findMany({ where: status ? { status } : {}, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ orders });
}));
router.get('/audit', asyncRoute(async (_req, res) => {
  const logs = await prisma.auditLog.findMany({ include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ logs });
}));
router.post('/orders/:id/reconcile', asyncRoute(async (req, res) => {
  const order = await prisma.serviceOrder.findUnique({ where: { id: req.params.id }, include: { user: { include: { account: true } } } });
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order was not found.');
  if (order.status !== 'PROCESSING') throw new ApiError(409, 'ORDER_NOT_PENDING', 'Only processing orders can be reconciled.');
  const updated = await reconcileOrder(order);
  await audit({ actorId: req.user.id, action: 'ADMIN_ORDER_RECONCILE', entityType: 'ServiceOrder', entityId: order.id, ipAddress: req.ip });
  res.json({ order: updated });
}));
module.exports = { adminRouter: router };
