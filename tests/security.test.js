const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, randomToken, tokenHash, reference } = require('../src/lib/security');

test('passwords are salted and verifiable', async () => {
  const first = await hashPassword('A-strong-password-123');
  const second = await hashPassword('A-strong-password-123');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('A-strong-password-123', first), true);
  assert.equal(await verifyPassword('wrong-password', first), false);
});

test('session tokens are random and stored as hashes', () => {
  const first = randomToken(), second = randomToken();
  assert.notEqual(first, second);
  assert.equal(tokenHash(first).length, 64);
  assert.notEqual(tokenHash(first), first);
});

test('external references have a prefix and remain unique', () => {
  const first = reference('order'), second = reference('order');
  assert.match(first, /^order_\d+_[a-f0-9]{12}$/);
  assert.notEqual(first, second);
});
