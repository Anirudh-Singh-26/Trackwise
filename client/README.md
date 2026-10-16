# Trackwise Frontend

The frontend is the React/Vite dashboard for employees, managers, and administrators.

## Stack

- React 19
- Vite 8
- JavaScript/JSX
- Lucide React icons

## Setup

From this directory:

```bash
npm install
```

Create a local `.env` from `.env.example`:

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

Run locally:

```bash
npm run dev
```

Build and verify:

```bash
npm run build
npm run preview
```

The default Vite development URL is usually `http://localhost:5173`. Ensure the backend's `CLIENT_ORIGIN` matches the actual frontend origin.

## Structure

```text
src/
├── components/
│   ├── auth/       # Login UI
│   ├── charts/     # Activity charts
│   ├── common/     # Shared filters and empty states
│   ├── layout/     # Sidebar and application layout
│   ├── pages/      # Dashboard/report pages
│   └── routing/    # Route outlet
├── hooks/          # Controller and state orchestration
├── services/       # API and domain-specific service calls
├── utils/          # Date, route, and tracking-event helpers
├── App.jsx
└── main.jsx
```

## Main Areas

- Overview and activity analytics
- Website/domain activity
- Breaks and work sessions
- Session health
- Reports and team/user administration
- Configuration and audit log
- Screenshot views are present in the codebase; use only if screenshot monitoring is explicitly approved and enabled by backend policy.

## Integration Notes

- API calls use `VITE_API_BASE_URL`.
- Authentication and permissions are enforced by the backend. Hiding a page or menu item is not a substitute for server authorization.
- Do not put server-only credentials or Cloudinary secrets in `VITE_*` variables; Vite variables are exposed to the browser bundle.
- If sign-in fails, check API availability, the configured base URL, backend CORS/`CLIENT_ORIGIN`, cookie settings, and browser console/network errors.

## Scope and Limitations

The dashboard displays information derived from browser/session events. Domain visits and idle intervals do not prove attention or productivity. Confirm report definitions against the backend before using figures for formal HR decisions.
