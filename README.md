# SchoolFlow Backend (Full & Improved)

Production‑ready SaaS backend for private schools in Nigeria.

## Key Improvements (v4.0)
- **Critical Fixes**:
  - Manual payment endpoints whitelisted in subscription middleware to avoid renewal deadlock.
  - Subscription duration frozen at purchase (billingCycleAtPurchase, durationDaysAtPurchase) to preserve billing integrity.
  - Expiry job switched to BullMQ repeatable jobs for persistence across server restarts.
- **Performance**:
  - Redis caching for subscription status (5‑minute TTL) to reduce DB load.
  - Idempotency fully enforced for invoice generation.
- **New Features**:
  - Bulk report card generation for an entire class with computed positions and class averages.
  - Migration script to backfill duration fields for existing subscriptions.
- **Reliability**:
  - BullMQ workers configured with retries (5 attempts) and dead‑letter alerting.
  - Enhanced webhook handling with locking and reconciliation.

## Features
- Multi‑tenant with robust isolation
- Full authentication (login, logout, refresh, token rotation)
- Complete financial ledger with invoices, payments, discounts, refunds
- Paystack integration with webhook verification
- Report Card Studio with template versioning and PDF generation
- Automation engine for reminders and workflows
- Queue‑based async jobs (SMS, email, PDF, reports)
- Platform admin dashboard
- Audit logging
- Offline‑capable sync endpoints (idempotency)
- Subscription billing and usage metering
- Comprehensive error handling and observability

## Setup
1. Clone and install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in values.
3. Start services: `docker-compose up -d mongo redis` (replica set auto-initialized)
4. Seed: `npm run seed`
5. Run dev: `npm run dev`

## Testing
`npm test`

## Production
`npm run build && npm start`

## Deployment
Use the provided Dockerfile and docker-compose for containerized deployment.
