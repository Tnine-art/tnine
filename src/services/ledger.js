const { prisma } = require('../db');
const { ApiError } = require('../lib/http');

async function getSystemAccount(tx, type, name) {
  const existing = await tx.ledgerAccount.findFirst({ where: { type, userId: null } });
  return existing || tx.ledgerAccount.create({ data: { type, name } });
}

async function postBalancedTransaction({ reference, type, description, userAccountId, amountKobo, direction, counterType, counterName, metadata }) {
  const amount = typeof amountKobo === 'bigint' ? amountKobo : BigInt(amountKobo);
  if (amount <= 0n) throw new ApiError(400, 'INVALID_AMOUNT', 'Amount must be a positive integer in kobo.');
  return prisma.$transaction(async tx => {
    const prior = await tx.ledgerTransaction.findUnique({ where: { reference }, include: { postings: true } });
    if (prior) return prior;
    const userDelta = direction === 'credit' ? amount : -amount;
    if (userDelta < 0) {
      const updated = await tx.ledgerAccount.updateMany({ where: { id: userAccountId, balanceKobo: { gte: amount } }, data: { balanceKobo: { decrement: amount } } });
      if (updated.count !== 1) throw new ApiError(409, 'INSUFFICIENT_BALANCE', 'Your wallet balance is too low.');
    } else {
      await tx.ledgerAccount.update({ where: { id: userAccountId }, data: { balanceKobo: { increment: amount } } });
    }
    const counter = await getSystemAccount(tx, counterType, counterName);
    await tx.ledgerAccount.update({ where: { id: counter.id }, data: { balanceKobo: { increment: -userDelta } } });
    return tx.ledgerTransaction.create({
      data: {
        reference, type, status: 'SUCCESSFUL', description,
        metadata: metadata ? JSON.stringify(metadata) : null,
        postings: { create: [{ accountId: userAccountId, amountKobo: userDelta }, { accountId: counter.id, amountKobo: -userDelta }] }
      }, include: { postings: true }
    });
  });
}

module.exports = { postBalancedTransaction };
