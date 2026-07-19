const test = require('node:test');
const assert = require('node:assert/strict');

test('PostgreSQL account, funding, purchase, and ledger flow', { skip: process.env.INTEGRATION_DATABASE !== 'true' }, async () => {
  const { createApp } = require('../src/app');
  const { prisma } = require('../src/db');
  const server = createApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  async function request(path, options = {}) {
    const response = await fetch(`${base}${path}`, { redirect: 'manual', ...options, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(options.headers || {}) } });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    const body = response.headers.get('content-type')?.includes('json') ? await response.json() : null;
    assert.ok(response.status < 400, body ? JSON.stringify(body) : `${response.status} ${path}`);
    return { response, body };
  }
  try {
    const email = `ci-${Date.now()}@example.com`;
    await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'CI Customer', email, password: 'Strong-test-password-123' }) });
    const initialized = await request('/api/payments/initialize', { method: 'POST', headers: { 'Idempotency-Key': 'ci-funding-unique-0001' }, body: JSON.stringify({ amountKobo: 10000 }) });
    const checkoutPath = new URL(initialized.body.checkoutUrl).pathname + new URL(initialized.body.checkoutUrl).search;
    await request(checkoutPath);
    const order = await request('/api/services/airtime', { method: 'POST', headers: { 'Idempotency-Key': 'ci-airtime-unique-0001' }, body: JSON.stringify({ network: 'MTN', phone: '08012345678', amountKobo: 5000 }) });
    assert.equal(order.body.order.status, 'SUCCESSFUL');
    const wallet = await request('/api/wallet');
    assert.equal(wallet.body.balanceKobo, 5000);
    const journals = await prisma.ledgerTransaction.findMany({ include: { postings: true } });
    assert.equal(journals.length, 2);
    for (const journal of journals) assert.equal(journal.postings.reduce((sum, posting) => sum + posting.amountKobo, 0n), 0n);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
  }
});
