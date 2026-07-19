# PayPoint

PayPoint is a full-stack airtime and data platform. The repository contains the responsive customer frontend, an Express API, secure server-side sessions, a balanced wallet ledger, Prisma database models, and isolated payment/VTU provider adapters.

## Local development

Requirements: Node.js 22 or newer.

1. Copy `.env.example` to `.env`.
2. Keep `PAYMENT_PROVIDER=mock` and `VTU_PROVIDER=mock` for local development.
3. Run `npm install`.
4. Run `npm run db:generate` and `npx prisma db push`.
5. Run `npm run dev`.
6. Open `http://localhost:3000` rather than opening the HTML file directly.

The mock checkout credits only the local development database. It is disabled automatically when `NODE_ENV=production`.

## Provider configuration

For Paystack sandbox payments, set `PAYMENT_PROVIDER=paystack` and add the Paystack test secret key. Configure the webhook URL as:

`https://your-domain.example/api/payments/webhooks/paystack`

For VTpass sandbox delivery, set `VTU_PROVIDER=vtpass` and provide the sandbox credentials. Review and replace the placeholder plan codes in `src/routes/services.js` with variation codes returned by the provider before enabling it.

Never place provider secret keys in `scripts.js`, HTML, source control, or any browser-visible configuration.

## Safety properties

- Passwords use salted scrypt hashes.
- Sessions use random opaque tokens; only token hashes are stored.
- Session cookies are HTTP-only and become Secure in production.
- Prices are selected and validated on the server.
- Money is represented as integer kobo.
- Wallet operations create equal and opposite ledger postings.
- Conditional debits prevent negative wallet balances.
- Idempotency keys protect payment and purchase submission.
- Failed VTU delivery after debit creates an automatic refund.
- Paystack webhooks require a valid signature and matching reference, status, and amount.

## Before production

- Switch SQLite to PostgreSQL and create reviewed migrations.
- Add verified production Paystack and VTU credentials through the hosting secret manager.
- Replace placeholder data-plan codes and prices.
- Add email verification, password recovery, MFA for administrators, and an admin interface.
- Add structured logs, error monitoring, backups, alerting, provider reconciliation, and background status requery jobs.
- Complete security, privacy, legal, and regulatory review.
- Run load, penetration, accessibility, and disaster-recovery testing.

The current provider configuration is deliberately sandbox-only and must not be presented as processing real money.
