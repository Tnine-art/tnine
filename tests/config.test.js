const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const base = {
  ...process.env,
  NODE_ENV: 'production', LIVE_MODE: 'true', APP_URL: 'https://paypoint.example',
  PAYMENT_PROVIDER: 'paystack', PAYSTACK_SECRET_KEY: 'sk_live_example',
  VTU_PROVIDER: 'vtpass', VTPASS_API_KEY: 'api-key', VTPASS_PUBLIC_KEY: 'public-key',
  VTPASS_BASE_URL: 'https://vtpass.com/api', EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_test_key'
};

test('live mode accepts a complete live configuration', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./src/config')"], { cwd: process.cwd(), env: base, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('live mode refuses a non-HTTPS application URL', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./src/config')"], { cwd: process.cwd(), env: { ...base, APP_URL: 'http://paypoint.example' }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HTTPS APP_URL/);
});

test('live mode refuses Paystack test credentials', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./src/config')"], { cwd: process.cwd(), env: { ...base, PAYSTACK_SECRET_KEY: 'sk_test_example' }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Paystack live secret key/);
});

test('production refuses missing email delivery', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./src/config')"], { cwd: process.cwd(), env: { ...base, LIVE_MODE: 'false', EMAIL_PROVIDER: 'console', RESEND_API_KEY: '' }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /configured email delivery/);
});
