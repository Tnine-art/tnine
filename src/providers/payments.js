const crypto = require('node:crypto');
const { config } = require('../config');
const { ApiError } = require('../lib/http');

class MockPaymentProvider {
  async initialize({ reference, amountKobo }) {
    return { providerReference: reference, checkoutUrl: `${config.appUrl}/api/payments/mock-checkout?reference=${encodeURIComponent(reference)}`, amountKobo };
  }
  verifyWebhook() { return true; }
}

class PaystackProvider {
  async initialize({ reference, amountKobo, email }) {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST', headers: { Authorization: `Bearer ${config.paystackSecretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference, amount: String(amountKobo), email, callback_url: config.paystackCallbackUrl })
    });
    const body = await response.json();
    if (!response.ok || !body.status) throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', body.message || 'Could not initialize payment.');
    return { providerReference: reference, checkoutUrl: body.data.authorization_url, accessCode: body.data.access_code };
  }
  verifyWebhook(rawBody, signature) {
    const digest = crypto.createHmac('sha512', config.paystackSecretKey).update(rawBody).digest('hex');
    const supplied = Buffer.from(signature || '', 'utf8'), expected = Buffer.from(digest, 'utf8');
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  }
}

function paymentProvider() {
  if (config.paymentProvider === 'paystack') {
    if (!config.paystackSecretKey) throw new Error('PAYSTACK_SECRET_KEY is required.');
    return new PaystackProvider();
  }
  return new MockPaymentProvider();
}
module.exports = { paymentProvider };
