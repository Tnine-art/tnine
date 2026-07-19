const path = require('node:path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const config = {
  env: process.env.NODE_ENV || 'development',
  liveMode: process.env.LIVE_MODE === 'true',
  port: Number(process.env.PORT || 3000),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  cookieName: process.env.SESSION_COOKIE_NAME || 'paypoint_session',
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS || 7),
  paymentProvider: process.env.PAYMENT_PROVIDER || 'mock',
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || '',
  paystackCallbackUrl: process.env.PAYSTACK_CALLBACK_URL || 'http://localhost:3000/dashboard.html',
  vtuProvider: process.env.VTU_PROVIDER || 'mock',
  vtpassApiKey: process.env.VTPASS_API_KEY || '',
  vtpassPublicKey: process.env.VTPASS_PUBLIC_KEY || '',
  vtpassSecretKey: process.env.VTPASS_SECRET_KEY || '',
  vtpassBaseUrl: process.env.VTPASS_BASE_URL || 'https://sandbox.vtpass.com/api',
  reconciliationIntervalSeconds: Number(process.env.RECONCILIATION_INTERVAL_SECONDS || 60),
  reconciliationMaxRetries: Number(process.env.RECONCILIATION_MAX_RETRIES || 10)
};

if (config.env === 'production' && (config.paymentProvider === 'mock' || config.vtuProvider === 'mock')) {
  throw new Error('Mock providers cannot be used in production.');
}
if (config.liveMode) {
  if (config.env !== 'production') throw new Error('LIVE_MODE requires NODE_ENV=production.');
  if (!config.appUrl.startsWith('https://')) throw new Error('LIVE_MODE requires an HTTPS APP_URL.');
  if (config.paymentProvider !== 'paystack' || !config.paystackSecretKey.startsWith('sk_live_')) throw new Error('LIVE_MODE requires a Paystack live secret key.');
  if (config.vtuProvider !== 'vtpass' || !config.vtpassApiKey || !config.vtpassPublicKey || config.vtpassBaseUrl.includes('sandbox')) throw new Error('LIVE_MODE requires VTpass live credentials and URL.');
}

module.exports = { config };
