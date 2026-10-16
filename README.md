# Trackwise — Employee Time & Browser Activity Platform

Trackwise is a web dashboard and Chrome extension for managing employee work sessions and breaks, recording browser-domain visits and idle intervals, and reviewing activity/session reports.

> **Important:** Domain visits and idle signals are limited observations; they are not proof of attention or productivity. The repository also contains a separate visible-tab screenshot feature. Keep it disabled unless explicitly approved and disclosed to employees.

## Project Structure

```text
employee-tracker/
├── client/       # React + Vite dashboard
├── server/       # Express API + MongoDB/Mongoose
├── extension/    # Chrome Manifest V3 extension
└── docs/         # Architecture, API, testing, and implementation notes
```

## Requirements

- Node.js (project tested with Node.js 22)
- npm
- MongoDB instance (local or Atlas)
- Google Chrome for extension testing
- Optional: Cloudinary credentials only if screenshot monitoring is approved and enabled

## Local Setup

### 1. Backend

```bash
cd server
npm install
```

Copy `.env.example` to `.env` and set at least `MONGODB_URI` and a unique `JWT_SECRET` (at least 32 characters). Set `CLIENT_ORIGIN=http://localhost:5173` for local development. Keep production secrets out of source control.

```bash
npm run dev
```

API default: `http://localhost:5000`  
Health check: `http://localhost:5000/api/v1/health`

### 2. Frontend

In a second terminal:

```bash
cd client
npm install
```

Copy `.env.example` to `.env` and set:

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

Then run:

```bash
npm run dev
```

Vite normally serves the dashboard at `http://localhost:5173`.

### 3. Chrome Extension

1. Start the API and dashboard.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this project's `extension/` directory.
5. Set `EXTENSION_ORIGIN` in the backend environment to the extension ID's exact origin (`chrome-extension://<extension-id>`) and restart the API.
6. Sign in through the dashboard, start a work session, then connect the extension using its popup.
7. Grant only the site permissions required by the approved policy.

If the extension ID changes, update `EXTENSION_ORIGIN`. Do not use wildcard CORS origins.

## Scripts

Backend (`server/`):

- `npm run dev` — development server with nodemon
- `npm start` — start server
- `npm run check` — project checks
- `npm test` — automated test suite
- `npm run seed:demo` — seed demo data (review script/environment safeguards first)

Frontend (`client/`):

- `npm run dev` — Vite development server
- `npm run build` — production build
- `npm run preview` — preview production build

## Roles

- **Employee:** own session and break controls, extension connection, own permitted records.
- **Manager:** reporting and activity for assigned employees.
- **Admin:** user management, configuration, audit log, organization-level reporting, and approved administrative actions.

Backend authorization is authoritative; frontend visibility alone is not access control.

## Documentation

- [Product Requirements Document](docs/PRD.md)
- [Technical Design Document](docs/TDD.md)
- [Backend README](server/README.md)
- [Frontend README](client/README.md)
- Existing implementation notes: `docs/`

## Security and Privacy Notes

- Never commit `.env` files, database credentials, JWT secrets, or Cloudinary secrets.
- Core activity tracking should record domain names and timestamps only—not full URLs, typed text, keystrokes, clicks, coordinates, or page contents.
- Screenshot monitoring is a separate sensitive feature in the current codebase. Do not enable it without manager approval, employee notice, access/retention policy, and an explicit decision that it is in scope.
- Use HTTPS, secure cookies, strong secrets, explicit CORS origins, and production monitoring before deployment.

## Current Limitations

- Domain usage duration/report aggregation must be validated; some reports are based on observed events rather than authoritative interval totals.
- Idle start timestamps are estimates based on Chrome's configured idle threshold.
- Automated checks do not replace end-to-end testing with the actual Chrome extension and target MongoDB deployment.
- Production load targets, retention/export rules, backups, and monitoring are still decisions for the project owner.
