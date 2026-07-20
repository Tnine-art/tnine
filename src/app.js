const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { ZodError } = require('zod');
const { ApiError, asyncRoute } = require('./lib/http');
const { authRouter } = require('./routes/auth');
const { walletRouter } = require('./routes/wallet');
const { paymentsRouter } = require('./routes/payments');
const { servicesRouter } = require('./routes/services');
const { adminRouter } = require('./routes/admin');
const { config } = require('./config');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.env === 'production') app.set('trust proxy', 1);
  app.set('json replacer', (_key, value) => typeof value === 'bigint' ? Number(value) : value);
  app.use(helmet());
  app.use(express.json({ limit: '100kb', verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/payments/webhooks/paystack') return next();
    const origin = req.get('origin');
    if (origin && new URL(origin).origin !== new URL(config.appUrl).origin) return next(new ApiError(403, 'INVALID_ORIGIN', 'Request origin is not allowed.'));
    next();
  });
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }), authRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/services', servicesRouter);
  app.use('/api/admin', adminRouter);
  app.get('/api/config', (_req, res) => res.json({ liveMode: config.liveMode }));
  app.get('/api/health', asyncRoute(async (_req, res) => {
    await require('./db').prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  }));

  for (const file of ['index.html', 'dashboard.html', 'admin.html', 'reset-password.html', 'legal.html', 'style.css', 'scripts.js', 'admin.js']) {
    app.get(file === 'index.html' ? ['/', '/index.html'] : `/${file}`, (_req, res) => res.sendFile(path.join(process.cwd(), file)));
  }
  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'API endpoint not found.')));
  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Check the submitted information.', details: error.issues } });
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    res.status(status).json({ error: { code: error.code || 'INTERNAL_ERROR', message: status >= 500 ? 'Something went wrong. Please try again.' : error.message } });
  });
  return app;
}
module.exports = { createApp };
