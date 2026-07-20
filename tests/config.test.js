const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const base = {
  ...process.env,
  NODE_ENV: 'production', DEPLOYMENT_STAGE: 'live', LIVE_MODE: 'true', APP_URL: 'https://paypoint.example',
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
  const result = spawnSync(process.execPath, ['-e', "require('./src/config')"], { cwd: process.cwd(), env: { ...base, DEPLOYMENT_STAGE: 'local', LIVE_MODE: 'false', EMAIL_PROVIDER: 'console', RESEND_API_KEY: '' }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /configured email delivery/);
});

test('hosted sandbox permits mock providers without enabling live mode', () => {
  const sandbox = {
    ...base, DEPLOYMENT_STAGE: 'sandbox', LIVE_MODE: 'false',
    PAYMENT_PROVIDER: 'mock', PAYSTACK_SECRET_KEY: '', VTU_PROVIDER: 'mock',
    EMAIL_PROVIDER: 'console', RESEND_API_KEY: ''
  };
  const result = spawnSync(process.execPath, ['-e', "require('./src/config')"], { cwd: process.cwd(), env: sandbox, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('sandbox mock fulfillment uses the live public VTpass catalog', () => {
  const result = spawnSync(process.execPath, ['-e', "console.log(require('./src/config').config.vtpassCatalogBaseUrl)"], { cwd: process.cwd(), env: { ...base, DEPLOYMENT_STAGE: 'sandbox', LIVE_MODE: 'false', VTU_PROVIDER: 'mock' }, encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /https:\/\/vtpass\.com\/api/);
});

test('live mode cannot be mislabeled as a sandbox', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./src/config')"], { cwd: process.cwd(), env: { ...base, DEPLOYMENT_STAGE: 'sandbox' }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /DEPLOYMENT_STAGE=live/);
});
