# Trackwise Backend

The backend is a Node.js/Express REST API. It owns authentication, authorization, session and break lifecycle, event validation, persistence, reporting, audit records, and optional screenshot-policy enforcement.

## Stack

- Node.js (project tested with Node 22)
- Express 4
- MongoDB + Mongoose 8
- bcryptjs, JWT, cookie-parser
- Helmet, CORS, express-rate-limit, CSRF middleware
- Optional Cloudinary + Multer for screenshot storage

## Setup

From this directory:

```bash
npm install
```

Copy `.env.example` to `.env` and configure:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/trackwise
JWT_SECRET=replace_with_a_unique_random_secret_at_least_32_characters
CLIENT_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
EXTENSION_ORIGIN=chrome-extension://<your-extension-id>
TRUST_PROXY=false
```

Use a real, unique secret. For local development, `COOKIE_SECURE=false` may be required on plain HTTP; production must use HTTPS and secure cookies. Set `EXTENSION_ORIGIN` to the exact installed extension origin. Leave optional bootstrap-admin and Cloudinary values unset unless required and authorized.

Run:

```bash
npm run dev
```

Health check:

```text
GET http://localhost:5000/api/v1/health
```

## Scripts

- `npm run dev` — start with nodemon
- `npm start` — start normally
- `npm run check` — run project checks
- `npm test` — run the automated test suite
- `npm run test:config` — environment validation tests
- `npm run test:tracking` — tracking event validation tests
- `npm run test:screenshots` — screenshot module tests
- `npm run seed:demo` — demo seed script; inspect its safeguards before use

## Modules and Data

Key route groups include authentication, users, sessions, breaks, tracking events, reports, audit logs, and screenshots. Core models include `User`, `WorkSession`, `Break`, `TrackingEvent`, and `AuditLog`. Screenshot-related models and routes are separate and should remain disabled unless approved.

The tracking event model includes a unique `eventId`, `schemaVersion`, source, employee/session references, event type, visit/activity IDs, domain, and observed/received timestamps. The unique event identifier supports deduplication.

## API Areas

Base prefix: `/api/v1`

- `/health`
- `/auth`
- `/users`
- `/sessions`
- `/breaks`
- `/tracking`
- `/reports`
- `/audit`
- `/screenshots` (conditional/approval-gated)

Refer to `../docs/API.md` and the route implementation for current request formats and role requirements. Do not assume all report endpoints return precise aggregated domain durations; some are based on observed events.

## Security Requirements

- Keep `.env` private and out of version control.
- Never log passwords, cookies, tokens, or request bodies.
- Use explicit CORS origins; do not wildcard-allow extension origins.
- Enforce role/employee scope in the API.
- Use CSRF protection for cookie-authenticated mutations and rate limits on sensitive endpoints.
- Use HTTPS, secure cookies, managed secrets, backups, monitoring, and a retention policy in production.
- Cloudinary credentials must remain backend-only.

## Operational Caveats

- Browser extension and MongoDB end-to-end behavior must be verified in the target environment.
- Idle start time is estimated from Chrome's idle threshold.
- Stale-session recovery is explicit/admin-triggered; do not assume stale sessions are automatically closed.
- Screenshot monitoring can capture sensitive browser content. Do not enable it without explicit approval, employee notice, domain exclusions, access restrictions, and an agreed retention policy.
