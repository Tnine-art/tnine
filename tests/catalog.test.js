const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeVariations } = require('../src/services/catalog');

test('provider variations become server-priced data plans', () => {
  const plans = normalizeVariations(
    { serviceId: 'mtn-data', type: 'data', label: 'MTN' },
    { content: { variations: [{ variation_code: 'mtn-demo', name: 'MTN 1GB', variation_amount: '750.50' }] } }
  );
  assert.deepEqual(plans, [{
    code: 'mtn-data:mtn-demo', variationCode: 'mtn-demo', serviceId: 'mtn-data',
    name: 'MTN 1GB', amountKobo: 75050, network: 'MTN'
  }]);
});

test('provider variations become TV plans and reject malformed prices', () => {
  const plans = normalizeVariations(
    { serviceId: 'dstv', type: 'tv', label: 'DStv' },
    { content: { variations: [
      { variation_code: 'valid', name: 'DStv Package', variation_amount: 5000 },
      { variation_code: 'invalid', name: 'Invalid package', variation_amount: 'not-a-price' }
    ] } }
  );
  assert.equal(plans.length, 1);
  assert.equal(plans[0].provider, 'DStv');
  assert.equal(plans[0].amountKobo, 500000);
  assert.equal(plans[0].customerReferenceType, 'smartcard');
});

test('Showmax variations request the account phone instead of a smartcard', () => {
  const [plan] = normalizeVariations(
    { serviceId: 'showmax', type: 'tv', label: 'Showmax' },
    { content: { variations: [{ variation_code: 'mobile', name: 'Mobile plan', variation_amount: '1600' }] } }
  );
  assert.equal(plan.customerReferenceType, 'phone');
  assert.equal(plan.provider, 'Showmax');
});
