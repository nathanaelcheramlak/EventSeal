# Implementation Plan

## 1. Goal

Build a lightweight web-based QR code generation and verification system for manually created organizer accounts.

The first deployment target is:

```text
React + TypeScript + Vite frontend
        |
        | HTTPS/JSON
        v
Fastify + TypeScript backend on Render
        |
        | PostgreSQL connection string
        v
Supabase PostgreSQL
```

The application should remain portable enough to move later to a VPS without changing core application code.

## 2. Core Decisions

- Use a TypeScript monorepo.
- Do not use Docker.
- Use plain PostgreSQL through environment variables.
- Keep all database access on the backend.
- Do not use Supabase Auth unless the system requirements change.
- Use manually inserted organizer accounts.
- Store password hashes only, using Argon2id or bcrypt.
- Use signed QR tokens that contain only a QR record ID and expiration timestamp.
- Do not store generated QR images on disk.
- Generate QR images on demand and return them as data URLs or downloadable PNG responses.
- Keep audit logs append-only from the application perspective.

## 3. Repository Structure

```text
apps/
  web/
    src/
    package.json
    vite.config.ts
  api/
    src/
      server.ts
      app.ts
      config/
      db/
      modules/
        auth/
        qr/
        audit/
      plugins/
      utils/
    package.json
    tsconfig.json
packages/
  shared/
    src/
      schemas/
      types/
    package.json
  db/
    migrations/
    src/
      schema.ts
      client.ts
    package.json
package.json
tsconfig.base.json
.env.example
README.md
System-Description.md
Implementation-Plan.md
```

Use npm workspaces unless there is a strong reason to use another package manager.

## 4. Backend Stack

- Runtime: Node.js LTS
- Package Manager: pnpm
- Framework: Fastify
- Language: TypeScript
- Validation: Zod
- Database access: Drizzle ORM or Kysely
- PostgreSQL driver: `pg`
- Password hashing: `argon2` preferred, `bcrypt` acceptable
- Auth token signing: `jose` or `jsonwebtoken`
- QR image generation: `qrcode`
- Testing: Vitest
- Load testing: k6 or autocannon

Recommended choice: Fastify + Zod + Drizzle + `pg`.

## 5. Frontend Stack

- React
- TypeScript
- Vite
- React Router
- TanStack Query or simple fetch wrappers
- Browser QR scanning library such as `html5-qrcode` or `@zxing/browser`

Initial screens:

- Login
- Dashboard
- Generate QR
- Verify QR
- Audit Logs

## 6. Database Schema

### organizers

```sql
id uuid primary key
username text not null unique
password_hash text not null
created_at timestamptz not null default now()
```

### qr_codes

```sql
id uuid primary key
created_by uuid not null references organizers(id)
name text not null
phone text
status text not null
created_at timestamptz not null default now()
expires_at timestamptz not null
```

Allowed statuses:

```text
ACTIVE
USED
REVOKED
EXPIRED
```

Add a database check constraint for status values.

### audit_logs

```sql
id bigserial primary key
organizer_id uuid references organizers(id)
qr_code_id uuid references qr_codes(id)
action text not null
result text not null
metadata jsonb not null default '{}'
created_at timestamptz not null default now()
```

Recommended indexes:

```sql
create index idx_qr_codes_status on qr_codes(status);
create index idx_qr_codes_expires_at on qr_codes(expires_at);
create index idx_audit_logs_created_at on audit_logs(created_at desc);
create index idx_audit_logs_qr_code_id on audit_logs(qr_code_id);
create index idx_audit_logs_organizer_id on audit_logs(organizer_id);
```

## 7. Environment Variables

```text
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://...
JWT_SECRET=...
QR_SIGNING_SECRET=...
WEB_ORIGIN=http://localhost:5173
TOKEN_TTL_SECONDS=86400
```

Production notes:

- `DATABASE_URL` should point to Supabase's suitable pooled connection URL for the Render backend.
- `JWT_SECRET` and `QR_SIGNING_SECRET` must be different.
- Secrets must only exist in backend environment variables.
- The frontend must never receive database credentials or signing secrets.

## 8. Authentication Flow

### POST /login

Input:

```json
{
  "username": "alice",
  "password": "password"
}
```

Behavior:

1. Validate input.
2. Find organizer by username.
3. Verify password hash.
4. Write audit log for success or failure.
5. Return an auth token.

Output:

```json
{
  "token": "..."
}
```

Initial implementation can use bearer tokens. A later hardening pass may switch to secure HttpOnly cookies.

## 9. Protected API Endpoints

All protected endpoints must require:

```http
Authorization: Bearer <token>
```

### POST /qr

Creates a QR code record and returns the signed token plus QR image.

Input:

```json
{
  "name": "John Doe",
  "phone": "09171234567",
  "expiresAt": "2026-08-01T00:00:00.000Z"
}
```

Behavior:

1. Validate input.
2. Insert a `qr_codes` row with status `ACTIVE`.
3. Sign a QR token with payload `{ id, exp }`.
4. Generate QR image from the signed token.
5. Write `QR_GENERATED` audit log.
6. Return QR ID, signed token, and QR image.

Output:

```json
{
  "qrId": "uuid",
  "qrToken": "...",
  "qrImage": "data:image/png;base64,..."
}
```

### POST /qr/verify

Verifies a scanned token.

Input:

```json
{
  "token": "..."
}
```

Verification order:

1. Verify token signature.
2. Check token expiration.
3. Extract QR record ID.
4. Load QR record from the database.
5. Check QR status.
6. Return QR data if valid.
7. Write audit log.

Output for valid QR:

```json
{
  "valid": true,
  "status": "ACTIVE",
  "data": {
    "name": "John Doe",
    "phone": "09171234567"
  }
}
```

Output for invalid QR:

```json
{
  "valid": false,
  "reason": "EXPIRED"
}
```

### GET /logs

Returns audit logs visible to all authenticated organizers.

Initial version should support pagination:

```http
GET /logs?limit=50&cursor=...
```

## 10. QR Token Design

Use a signed token with this payload:

```json
{
  "id": "qr-code-uuid",
  "exp": 1780000000
}
```

Rules:

- The token must not contain name, phone, organizer username, or audit data.
- The token must be signed with `QR_SIGNING_SECRET`.
- Modified tokens must be rejected before any QR lookup.
- Expired tokens must be rejected before returning stored QR data.
- Do not log full token values.

## 11. QR Status Behavior

Initial implementation:

- Generated QR codes start as `ACTIVE`.
- Verification does not automatically change `ACTIVE` to `USED`.
- Expired tokens return an expiration error even if the database status is still `ACTIVE`.

Optional later behavior:

- Add a setting to mark a QR as `USED` after successful verification.
- If enabled, implement it atomically:

```sql
update qr_codes
set status = 'USED'
where id = $1
  and status = 'ACTIVE'
  and expires_at > now()
returning *;
```

## 12. Audit Logging

Audit these actions:

- `LOGIN_SUCCESS`
- `LOGIN_FAILED`
- `QR_GENERATED`
- `QR_VERIFY_SUCCESS`
- `QR_VERIFY_FAILED`

Each audit entry should include:

- organizer ID if known
- QR code ID if known
- action
- result
- timestamp
- small metadata object for reason codes or request context

Do not put sensitive data into audit metadata.

## 13. Security Requirements

Implement:

- Password hashing with Argon2id or bcrypt.
- Signed auth tokens.
- Separate QR signing secret.
- Input validation on every route.
- CORS restricted to the frontend origin.
- Rate limiting on `/login` and `/qr/verify`.
- Generic login error messages.
- No plain-text passwords in logs, code, or seed files.
- No full QR tokens in logs.
- Helmet-style security headers where applicable.

Avoid:

- Direct frontend database access.
- Storing secrets in the repository.
- Relying on sequential QR IDs.
- Building authorization behavior that is not required by the spec.

## 14. Performance Plan

Target:

```text
100 concurrent QR verification requests
95% of warm verification requests under 500ms
```

Implementation choices:

- Keep verification route small.
- Use indexed QR lookups by primary key.
- Use pooled PostgreSQL connections.
- Avoid generating QR images during verification.
- Write compact audit metadata.
- Use pagination for logs.

Testing:

- Create test QR records.
- Run warm load tests against `/qr/verify`.
- Track p50, p95, p99, error rate, and database connection errors.
- Separately document Render free-tier cold-start latency.

The 500ms target should be evaluated only after the Render service is already awake.

## 15. Development Phases

### Phase 1: Project Setup

- Initialize npm workspace.
- Add `apps/web`, `apps/api`, `packages/shared`, and `packages/db`.
- Add shared TypeScript config.
- Add linting and formatting.
- Add `.env.example`.

Acceptance:

- `npm install` works.
- TypeScript builds across the workspace.

### Phase 2: Database

- Define schema.
- Create migrations.
- Add database client.
- Add seed script for manually creating organizers.

Acceptance:

- Migrations can create all required tables.
- A developer can create an organizer with a hashed password.

### Phase 3: Backend Foundation

- Create Fastify app.
- Add config validation.
- Add database connection.
- Add health endpoint.
- Add error handling.
- Add request validation helpers.

Acceptance:

- API starts locally.
- `GET /health` returns success.

### Phase 4: Authentication

- Implement `/login`.
- Add password verification.
- Add auth token creation.
- Add auth middleware.
- Add login audit logs.

Acceptance:

- Valid organizer can log in.
- Invalid login fails safely.
- Protected routes reject missing or invalid tokens.

### Phase 5: QR Generation

- Implement QR record creation.
- Implement QR token signing.
- Generate QR image from signed token.
- Add audit log entry.

Acceptance:

- Authenticated organizer can generate QR code.
- QR token contains no personal data.
- QR image can be scanned into the signed token.

### Phase 6: QR Verification

- Implement signature verification.
- Implement expiration check.
- Implement QR lookup.
- Implement status validation.
- Add audit log for success and failure.

Acceptance:

- Valid token returns stored QR data.
- Modified token is rejected.
- Expired token is rejected.
- Missing QR record is rejected.
- Non-active QR statuses return appropriate responses.

### Phase 7: Audit Log UI and API

- Implement paginated `GET /logs`.
- Build audit log frontend view.

Acceptance:

- Authenticated organizers can view complete audit history.
- Audit records cannot be edited or deleted through the app.

### Phase 8: Frontend

- Build login screen.
- Build dashboard.
- Build QR generation form.
- Build QR result/download view.
- Build QR scanner/verification screen.
- Build audit logs screen.

Acceptance:

- Organizer can complete login, generate, scan, verify, and inspect logs from the browser.

### Phase 9: Testing

- Add backend unit tests for token signing, auth, validation, and status handling.
- Add integration tests for main API flows.
- Add frontend smoke tests for core screens.
- Add load test script for `/qr/verify`.

Acceptance:

- Test suite passes.
- Load test results are documented.

### Phase 10: Render + Supabase Deployment

- Create Supabase project.
- Run migrations.
- Create initial organizer accounts.
- Create Render backend web service.
- Create static frontend deployment.
- Add environment variables.
- Configure CORS.
- Verify HTTPS requests.

Acceptance:

- Production login works.
- Production QR generation works.
- Production QR verification works.
- Production audit logs work.

### Phase 11: VPS Migration Readiness

Keep the app portable by relying only on:

- Node.js
- static frontend build output
- PostgreSQL connection string
- environment variables

Potential VPS deployment without Docker:

```text
Node.js process managed by systemd
Caddy or Nginx for HTTPS and reverse proxy
PostgreSQL either on Supabase or installed on the VPS
frontend served as static files
```

## 16. Acceptance Checklist

- Organizers can log in with pre-created accounts.
- Passwords are never stored in plain text.
- Protected endpoints require authentication.
- QR generation creates a database record.
- QR code embeds only a signed token.
- Modified QR tokens are rejected.
- Expired QR tokens are rejected.
- QR verification returns stored data only after successful checks.
- Important actions create audit records.
- All organizers can view the complete audit log.
- The backend keeps database credentials and signing secrets private.
- Warm `/qr/verify` performance is tested at 100 concurrent requests.
- Render free-tier cold starts are documented separately from warm performance.

## 17. Main Risks

- Render free-tier cold starts may fail the latency requirement after inactivity.
- Supabase free-tier limits may be enough for testing but not for a busy real event.
- Audit logs can grow quickly if every failed scan is recorded without pagination and indexing.
- If QR codes become single-use, verification must be atomic to avoid double-use under concurrency.
- If phones with weak cameras are expected, QR image size and contrast need real-device testing.

