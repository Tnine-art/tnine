const test = require('node:test');
const assert = require('node:assert/strict');
const { requireAdmin } = require('../src/middleware/admin');

test('admin middleware permits administrators', () => {
  let called = false;
  requireAdmin({ user: { role: 'ADMIN' } }, {}, error => { assert.equal(error, undefined); called = true; });
  assert.equal(called, true);
});

test('admin middleware rejects customer accounts', () => {
  requireAdmin({ user: { role: 'CUSTOMER' } }, {}, error => {
    assert.equal(error.status, 403);
    assert.equal(error.code, 'ADMIN_REQUIRED');
  });
});
