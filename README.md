# EventSeal

EventSeal is a lightweight QR admission system for event organizers. It generates signed QR passes, verifies them from a browser camera, tracks QR lifecycle state, and keeps an auditable event history.

The project is designed to stay simple enough for one developer while keeping the core security and production requirements explicit.

## Architecture

```text
React + TypeScript + Vite
        |
        | HTTPS / JSON
        v
Node.js + TypeScript + Fastify
        |
        | pooled PostgreSQL connection
        v
Supabase PostgreSQL
```

Workspace layout:

- `apps/web`: organizer console built with React, TypeScript, and Vite.
- `apps/api`: Fastify API for auth, QR generation, verification, lifecycle actions, and audit logs.
- `packages/shared`: shared Zod schemas and API types.
- `packages/db`: PostgreSQL schema, migrations, and database scripts.

## Core Capabilities

- Organizer authentication with JWT bearer tokens.
- Signed QR generation with no personal data inside the QR token.
- Camera-first QR verification with manual token fallback.
- QR record listing, detail view, and revocation.
- Append-only audit log visibility with pagination and filters.
- Mobile-first organizer console for event check-in workflows.

## Prerequisites

- Node.js
- pnpm
- A PostgreSQL database, such as Supabase PostgreSQL

Docker is not required.

## Quick Start

Install dependencies and create a local environment file:

```powershell
pnpm install
Copy-Item .env.example .env
```

Generate two separate secrets:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Use one value for `JWT_SECRET` and the other for `QR_SIGNING_SECRET`.

Update `.env`:

```env
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://...
JWT_SECRET=generated-secret-one
QR_SIGNING_SECRET=generated-secret-two
WEB_ORIGIN=http://localhost:5173
TOKEN_TTL_SECONDS=86400
QR_MAX_TTL_DAYS=30
VITE_API_URL=http://localhost:4000
VITE_QR_MAX_TTL_DAYS=30
```

Check the database connection, run migrations, and create the first organizer:

```powershell
pnpm db:check
pnpm db:migrate
pnpm create-user alice "change-this-password"
```

Start the app:

```powershell
pnpm dev
```

Local URLs:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

## Environment Variables

Backend-only variables:

- `NODE_ENV`: `development`, `test`, or `production`.
- `PORT`: API port. Defaults to `4000` locally.
- `DATABASE_URL`: PostgreSQL connection URL.
- `JWT_SECRET`: secret used to sign organizer auth tokens.
- `QR_SIGNING_SECRET`: separate secret used to sign QR tokens.
- `WEB_ORIGIN`: comma-separated list of allowed browser origins for CORS.
- `TOKEN_TTL_SECONDS`: organizer auth token lifetime.
- `QR_MAX_TTL_DAYS`: maximum allowed QR expiration window.

Frontend variables:

- `VITE_API_URL`: public API base URL.
- `VITE_QR_MAX_TTL_DAYS`: frontend copy of the QR expiration limit.

Do not expose `DATABASE_URL`, `JWT_SECRET`, or `QR_SIGNING_SECRET` to the frontend deployment.

If a database password contains reserved URL characters, percent-encode them inside `DATABASE_URL`.

Common examples:

```text
# becomes %23
@ becomes %40
/ becomes %2F
? becomes %3F
: becomes %3A
space becomes %20
```

## Database

For Supabase, use the pooled PostgreSQL connection string when available and keep `sslmode=require` if Supabase includes it.

Useful commands:

```powershell
pnpm db:check
pnpm db:migrate
pnpm create-user alice "change-this-password"
```

The migration runner creates a `schema_migrations` table and applies each SQL file once. Organizer usernames are normalized to lowercase before storage and lookup. Passwords are hashed with bcrypt using cost factor `12`.

## Product Workflows

### Authentication

Organizers sign in with `POST /login`. The API returns a bearer token sent on protected requests as:

```http
Authorization: Bearer <token>
```

The frontend stores the token in browser local storage for the first lightweight version and clears it on sign-out or expiration. Failed login responses are generic and audited without storing passwords.

### QR Generation

Authenticated organizers can create QR codes from a name, optional phone number, and expiration date.

Server-side rules:

- QR records are created with status `ACTIVE`.
- `phone` is optional and stored as `null` when omitted.
- `QR_MAX_TTL_DAYS` limits how far into the future a QR code can expire.
- The signed QR token contains only the QR record ID and expiration timestamp.
- The token does not contain name, phone, organizer, or audit information.

Frontend behavior:

- Generated QR images are previewed immediately.
- Organizers can download QR images as PNG files.
- Organizers can print QR output from the browser.
- Organizers can copy the signed token for testing.

### QR Verification

The Verify screen is camera-first and optimized for mobile event use. Manual token paste remains available as a fallback.

Backend verification order:

1. Verify the QR token signature.
2. Check the token expiration timestamp.
3. Load the QR record by ID.
4. Reject missing records.
5. Reject records whose database expiration has passed.
6. Reject non-`ACTIVE` statuses.
7. Return stored QR data and write a success audit log.

Camera access works on `localhost` during development. Deployed browser camera access requires HTTPS.

Verification does not automatically change a QR record from `ACTIVE` to `USED`. Single-use behavior is deferred until the event process requires it.

### QR Lifecycle

Organizers can manage generated QR records from the QR Records screen.

Available actions:

- List generated QR records.
- View stored QR details and status.
- Revoke an `ACTIVE` QR record.

Revocation is an atomic `ACTIVE -> REVOKED` status change. Revocation does not delete the QR record or its audit history.

### Audit Logs

Organizers can view complete audit history from the Audit Logs screen.

Available filters:

- Action type.
- Result.
- Organizer username.
- QR ID.

Audit logs are cursor-paginated, sorted newest first, and append-only through the application. The app does not expose audit edit or delete endpoints.

Audit metadata must stay limited to operational context such as failure reason or status transition. Full QR tokens, passwords, signing secrets, and database credentials must never be written to audit metadata.

Initial retention policy: keep all audit logs during the pilot. If volume affects query performance or storage, add export/archive behavior during the production readiness gate.

## Frontend UX

The organizer console is mobile-first:

- Bottom navigation on mobile.
- Direct tab URLs with `#generate`, `#verify`, `#records`, and `#logs`.
- Camera-first verification.
- Labeled mobile rows for QR records and audit logs.
- Fast visible feedback for valid, invalid, expired, revoked, and used QR codes.
- Reduced-motion support for users who prefer less motion.

## Verification

Run these before deployment:

```powershell
pnpm build
pnpm typecheck
pnpm test
pnpm db:check
```

## Render Deployment

### Backend Web Service

Root directory:

```text
.
```

Build command:

```bash
pnpm install --frozen-lockfile && pnpm build:api
```

Start command:

```bash
pnpm --dir apps/api start
```

Backend environment variables:

```text
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://...
JWT_SECRET=...
QR_SIGNING_SECRET=...
WEB_ORIGIN=https://your-frontend-domain
TOKEN_TTL_SECONDS=86400
QR_MAX_TTL_DAYS=30
```

Do not set `VITE_API_URL` on the backend service.

### Frontend Static Site

Root directory:

```text
.
```

Build command:

```bash
pnpm install --frozen-lockfile && pnpm build:web
```

Publish directory:

```text
apps/web/dist
```

Frontend environment variables:

```text
VITE_API_URL=https://your-render-api-url
VITE_QR_MAX_TTL_DAYS=30
```

Do not set database credentials or signing secrets on the frontend service.

## Supabase Deployment

1. Create a Supabase project.
2. Copy the pooled PostgreSQL connection URL.
3. Set it as `DATABASE_URL` locally and on Render.
4. Run `pnpm db:migrate`.
5. Create organizer accounts with `pnpm create-user`.

## Production Notes

- Keep auth signing and QR signing secrets separate.
- Restrict CORS to the deployed frontend origin.
- Use HTTPS in production so camera scanning works reliably.
- Rotate secrets through deployment environment settings, not committed files.
- Review logs before launch to confirm no QR tokens or secrets are written.
- Validate mobile scanning and printed QR quality with real devices before the event.
