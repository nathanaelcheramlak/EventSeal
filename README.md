# Prom Event QR System

Lightweight TypeScript monorepo for a QR code generation and verification system.

## Stack

- `apps/web`: React + TypeScript + Vite
- `apps/api`: Node.js + TypeScript + Fastify
- `packages/shared`: shared Zod schemas and API types
- `packages/db`: PostgreSQL schema, migrations, and DB client

## Setup

Install dependencies and create a local environment file:

```powershell
pnpm install
Copy-Item .env.example .env
```

Generate two different secrets:

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
VITE_API_URL=http://localhost:4000
```

The backend and frontend both read the root `.env` during local development.

## Development

```bash
pnpm dev
```

Or run each side separately:

```bash
pnpm dev:api
pnpm dev:web
```

## Build

```bash
pnpm build
```

## Database

Create a Supabase project, then copy the PostgreSQL connection string into `DATABASE_URL`.

For Render, use Supabase's pooled connection string in session mode when available. Keep `sslmode=require` if Supabase includes it.

Run the SQL migration in `packages/db/migrations/0001_initial.sql` against Supabase. In the Supabase dashboard, open the SQL editor, paste the migration, and run it.

Create an organizer:

```powershell
pnpm create-organizer alice "change-this-password"
```

## Local URLs

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`

## Verification

```powershell
pnpm build
pnpm typecheck
pnpm test
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
pnpm --filter @prom-event/api start
```

Environment variables:

```text
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://...
JWT_SECRET=...
QR_SIGNING_SECRET=...
WEB_ORIGIN=https://your-frontend-domain
TOKEN_TTL_SECONDS=86400
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

Environment variables:

```text
VITE_API_URL=https://your-render-api-url
```

Do not set database credentials or signing secrets on the frontend service.

## Supabase Deployment

1. Create a Supabase project.
2. Copy the pooled PostgreSQL connection URL.
3. Set it as `DATABASE_URL` in Render and local `.env`.
4. Run `packages/db/migrations/0001_initial.sql` in the Supabase SQL editor.
5. Create organizer accounts with `pnpm create-organizer`.
