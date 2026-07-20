const { prisma } = require('./db');
const { config } = require('./config');
const { reconcilePendingOrders } = require('./services/reconciliation');

let stopping = false;
async function run() {
  console.log('PayPoint reconciliation worker started.');
  while (!stopping) {
    try {
      const results = await reconcilePendingOrders();
      if (results.length) console.log(`Reconciled ${results.length} pending order(s).`);
      const now = new Date();
      await prisma.$transaction([
        prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
        prisma.session.deleteMany({ where: { expiresAt: { lt: now } } })
      ]);
    } catch (error) { console.error('Reconciliation cycle failed:', error); }
    await new Promise(resolve => setTimeout(resolve, config.reconciliationIntervalSeconds * 1000));
  }
  await prisma.$disconnect();
}
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
run();
