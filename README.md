# PayPoint

PayPoint is a full-stack airtime and data platform with a responsive customer experience, secure Express API, PostgreSQL ledger, payment and VTU provider adapters, a restricted operations dashboard, and a pending-order reconciliation worker.

## Current operating state

The application is production-structured but intentionally starts with `LIVE_MODE=false`. That state uses test provider credentials and must remain active until Paystack, VTpass, compliance, support, monitoring, and reconciliation checks have been approved.

`LIVE_MODE=true` is guarded. Startup fails unless all of the following are present:

- `NODE_ENV=production`
- an HTTPS `APP_URL`
- `PAYMENT_PROVIDER=paystack`
- a Paystack secret beginning with `sk_live_`
- `VTU_PROVIDER=vtpass`
- VTpass credentials and a non-sandbox URL

## Local PostgreSQL setup

Requirements: Node.js 22+, PostgreSQL, and npm.

1. Copy `.env.example` to `.env` and set a local PostgreSQL `DATABASE_URL`.
2. Keep `NODE_ENV=development`, `LIVE_MODE=false`, `PAYMENT_PROVIDER=mock`, and `VTU_PROVIDER=mock`.
3. Run `npm ci`.
4. Run `npm run db:generate` and `npm run db:deploy`.
5. Run `npm run dev`.
6. In another terminal, run `npm run worker`.
7. Open `http://localhost:3000`.

The public site uses separate `/login.html` and `/register.html` pages. While `LIVE_MODE=false`, both pages clearly identify the account as a sandbox/demo account and all provider activity remains non-live. The same pages automatically switch to production wording only after the guarded live configuration is enabled.

The mock checkout exists only outside production and never charges real money.

## Container deployment

`compose.yaml` defines PostgreSQL, a one-time migration service, the API, and the reconciliation worker. Create a deployment `.env` containing at least:

```env
POSTGRES_PASSWORD=use-a-long-url-safe-password
APP_URL=https://your-domain.example
LIVE_MODE=false
PAYMENT_PROVIDER=paystack
PAYSTACK_SECRET_KEY=sk_test_replace_me
VTU_PROVIDER=vtpass
VTPASS_API_KEY=replace_me
VTPASS_PUBLIC_KEY=replace_me
VTPASS_SECRET_KEY=replace_me
VTPASS_BASE_URL=https://sandbox.vtpass.com/api
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_replace_me
EMAIL_FROM=PayPoint <no-reply@your-domain.example>
```

Then run `docker compose up --build -d`. Terminate TLS at a trusted reverse proxy or managed load balancer. Do not expose PostgreSQL publicly.

## Administrator setup

Set `ADMIN_EMAIL` and an `ADMIN_PASSWORD` containing at least 12 characters in the process environment, then run:

```bash
npm run admin:create
```

Log in from the normal account form. Administrator accounts are redirected to `/admin.html`. The operations dashboard exposes customer balances, orders, payment volume, provider reconciliation controls, and the audit trail.

Remove `ADMIN_PASSWORD` from the environment immediately after provisioning. Administrator MFA and IP/access policies are still required before public launch.

## Password recovery email

Password recovery uses hashed, single-use database tokens that expire after 30 minutes. Successful password changes revoke every existing session and create an audit record.

Development uses `EMAIL_PROVIDER=console`; the reset link is written to the server console. Production refuses to start unless `EMAIL_PROVIDER=resend` and `RESEND_API_KEY` are configured. Verify the sending domain with the email provider and set `EMAIL_FROM` to an address on that domain. Never expose the email API key in browser code or GitHub.

## Paystack

Set the Paystack webhook to:

`https://your-domain.example/api/payments/webhooks/paystack`

The backend initializes payments, verifies webhook signatures, matches reference/status/amount, and credits the wallet idempotently. Secret keys must be stored only in the deployment secret manager.

## VTpass

The adapter supports purchase and transaction requery. Before activation:

- replace the placeholder plan codes and prices in `src/routes/services.js` with current provider variation codes;
- test every plan and network in the VTpass sandbox;
- verify success, pending, timeout, failure, and refund behavior;
- fund and monitor the provider account;
- confirm the correct live requery endpoint and response codes with the provider.

The worker checks orders left in `PROCESSING`. Confirmed failures are refunded through a balanced ledger entry; unresolved orders remain available for restricted manual reconciliation.

## Financial and security properties

- Passwords use salted scrypt hashes.
- Sessions are random opaque tokens stored as hashes and sent in HTTP-only cookies.
- Money is represented as integer kobo.
- Prices and plans are controlled by the server.
- Wallet movements have equal and opposite postings.
- Conditional updates prevent negative wallet balances.
- Idempotency protects payment and purchase submission.
- Paystack webhooks require valid signatures.
- Administrative operations are role-protected and audited.
- Mock providers cannot run with `NODE_ENV=production`.
- Live mode cannot start with sandbox configuration.

## Required before public launch

- verified Paystack and VTpass production accounts;
- reviewed plan codes, retail prices, margins, and refund rules;
- email verification and password recovery provider;
- administrator MFA and separation of duties;
- provider balance alerts and daily financial reconciliation;
- structured logs, error tracking, uptime monitoring, and incident response;
- encrypted PostgreSQL backups and restoration drills;
- load, penetration, accessibility, and disaster-recovery testing;
- approved privacy notice, customer terms, complaint process, and regulatory operating model;
- a cleared product name, production domain, and real support contacts.

Never commit `.env`, production credentials, customer exports, or database backups.
