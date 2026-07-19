const { prisma } = require('../db');
const { config } = require('../config');
const { vtuProvider } = require('../providers/vtu');
const { postBalancedTransaction } = require('./ledger');
const { audit } = require('./audit');

async function refundOrder(order, reason) {
  const ledger = await postBalancedTransaction({
    reference: `refund_${order.reference}`, type: 'REFUND', description: `Refund for ${order.description}`,
    userAccountId: order.user.account.id, amountKobo: order.amountKobo, direction: 'credit',
    counterType: 'VTU_CLEARING', counterName: 'VTU provider clearing', metadata: { orderReference: order.reference, reason }
  });
  const updated = await prisma.serviceOrder.update({ where: { id: order.id }, data: { status: 'REFUNDED', lastCheckedAt: new Date() } });
  await audit({ action: 'ORDER_REFUNDED', entityType: 'ServiceOrder', entityId: order.id, metadata: { reason, ledgerTransactionId: ledger.id } });
  return updated;
}

async function reconcileOrder(order) {
  const result = await vtuProvider().queryStatus({ reference: order.reference, providerReference: order.providerRef });
  if (result.successful) {
    const updated = await prisma.serviceOrder.update({ where: { id: order.id }, data: { status: 'SUCCESSFUL', providerRef: result.providerReference, lastCheckedAt: new Date(), retryCount: { increment: 1 } } });
    await audit({ action: 'ORDER_RECONCILED_SUCCESS', entityType: 'ServiceOrder', entityId: order.id, metadata: { providerCode: result.rawCode } });
    return updated;
  }
  if (result.failed) return refundOrder(order, `Provider returned ${result.rawCode || 'failed'}`);
  return prisma.serviceOrder.update({ where: { id: order.id }, data: { lastCheckedAt: new Date(), retryCount: { increment: 1 } } });
}

async function reconcilePendingOrders(limit = 50) {
  const orders = await prisma.serviceOrder.findMany({
    where: { status: 'PROCESSING', retryCount: { lt: config.reconciliationMaxRetries } },
    include: { user: { include: { account: true } } }, orderBy: { updatedAt: 'asc' }, take: limit
  });
  const results = [];
  for (const order of orders) {
    try { results.push({ id: order.id, status: (await reconcileOrder(order)).status }); }
    catch (error) {
      await prisma.serviceOrder.update({ where: { id: order.id }, data: { lastCheckedAt: new Date(), retryCount: { increment: 1 } } });
      results.push({ id: order.id, status: 'ERROR', error: error.message });
    }
  }
  return results;
}
module.exports = { reconcilePendingOrders, reconcileOrder, refundOrder };
