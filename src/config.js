const path = require('node:path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const hostedAppUrl = process.env.RENDER_EXTERNAL_URL || (vercelHost ? `https://${vercelHost}` : '');

const config = {
  env: process.env.NODE_ENV || 'development',
  deploymentStage: process.env.DEPLOYMENT_STAGE || 'local',
  liveMode: process.env.LIVE_MODE === 'true',
  port: Number(process.env.PORT || 3000),
  appUrl: process.env.APP_URL || hostedAppUrl || 'http://localhost:3000',
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
  vtpassCatalogBaseUrl: process.env.VTPASS_CATALOG_BASE_URL || ((process.env.VTU_PROVIDER || 'mock') === 'mock' ? 'https://vtpass.com/api' : (process.env.VTPASS_BASE_URL || 'https://sandbox.vtpass.com/api')),
  reconciliationIntervalSeconds: Number(process.env.RECONCILIATION_INTERVAL_SECONDS || 60),
  reconciliationMaxRetries: Number(process.env.RECONCILIATION_MAX_RETRIES || 10),
  emailProvider: process.env.EMAIL_PROVIDER || 'console',
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || 'PayPoint <no-reply@localhost>',
  passwordResetTtlMinutes: Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30)
};

if (!['local', 'sandbox', 'live'].includes(config.deploymentStage)) throw new Error('DEPLOYMENT_STAGE must be local, sandbox, or live.');
if (config.liveMode && config.deploymentStage !== 'live') throw new Error('LIVE_MODE requires DEPLOYMENT_STAGE=live.');
if (!config.liveMode && config.deploymentStage === 'live') throw new Error('DEPLOYMENT_STAGE=live requires LIVE_MODE=true.');
if (config.env === 'production' && config.deploymentStage !== 'sandbox' && (config.paymentProvider === 'mock' || config.vtuProvider === 'mock')) {
  throw new Error('Mock providers cannot be used in production.');
}
if (config.env === 'production' && config.deploymentStage !== 'sandbox' && (config.emailProvider !== 'resend' || !config.resendApiKey)) {
  throw new Error('Production requires configured email delivery.');
}
if (config.liveMode) {
  if (config.env !== 'production') throw new Error('LIVE_MODE requires NODE_ENV=production.');
  if (!config.appUrl.startsWith('https://')) throw new Error('LIVE_MODE requires an HTTPS APP_URL.');
  if (config.paymentProvider !== 'paystack' || !config.paystackSecretKey.startsWith('sk_live_')) throw new Error('LIVE_MODE requires a Paystack live secret key.');
  if (config.vtuProvider !== 'vtpass' || !config.vtpassApiKey || !config.vtpassPublicKey || config.vtpassBaseUrl.includes('sandbox')) throw new Error('LIVE_MODE requires VTpass live credentials and URL.');
}

module.exports = { config };
