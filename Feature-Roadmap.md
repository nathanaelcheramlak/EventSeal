# Feature Roadmap

This roadmap turns the system description into implementation milestones with production-readiness gates. The goal is to keep the first version small while avoiding shortcuts that would be expensive to fix later.

## Status Legend

- `Todo`: Not started.
- `In Progress`: Active work.
- `Done`: Implemented and verified.
- `Blocked`: Needs an external decision, credential, account, or environment.

## Phase 0: Baseline Project

Status: `Done`

Purpose: Establish the lightweight pnpm monorepo and a working vertical skeleton.

Features:

- `Done`: pnpm workspace setup.
- `Done`: React + Vite frontend scaffold.
- `Done`: Fastify API scaffold.
- `Done`: Shared Zod schema package.
- `Done`: PostgreSQL schema package.
- `Done`: Initial SQL migration.
- `Done`: Basic QR token signing test.
- `Done`: Add README deployment commands for Render and Supabase.
- `Done`: Add `.env` setup notes for local and production.

Exit criteria:

- `pnpm install` succeeds.
- `pnpm build` succeeds.
- `pnpm typecheck` succeeds.
- `pnpm test` succeeds.
- New developer can understand how to run the app from `README.md`.

## Phase 1: Database and Environment Setup

Status: `Todo`

Purpose: Make the database usable and repeatable across local, Supabase, and future VPS deployments.

Features:

- Create Supabase project.
- Choose the correct Supabase pooled connection string.
- Run `packages/db/migrations/0001_initial.sql`.
- Create at least one organizer with `pnpm create-organizer`.
- Confirm the API can connect to Supabase.
- Add a migration history workflow.
- Decide whether migrations are run manually, with Drizzle, or by a CI/deploy step.

Production-readiness tasks:

- Confirm `DATABASE_URL` uses SSL.
- Confirm Render environment variables are configured only on the backend.
- Confirm frontend receives only `VITE_API_URL`.
- Document how to rotate `JWT_SECRET` and `QR_SIGNING_SECRET`.

Exit criteria:

- Database schema exists in Supabase.
- First organizer account works.
- No secrets are committed to the repository.
- Local API can connect to the remote database.

## Phase 2: Authentication

Status: `Todo`

Purpose: Make organizer access reliable and secure.

Features:

- Complete `/login` behavior against the real database.
- Add generic login failure response.
- Add login audit events for success and failure.
- Add protected route middleware.
- Add auth persistence in frontend.
- Add sign-out behavior.
- Add token expiration handling in frontend.

Production-readiness tasks:

- Decide whether to keep bearer tokens or move to secure HttpOnly cookies.
- Add rate limiting specifically to `/login`.
- Normalize usernames consistently.
- Add tests for valid login, invalid username, invalid password, missing token, invalid token, and expired token.
- Ensure password hashes are generated with a strong cost factor.

Exit criteria:

- Only authenticated organizers can access protected endpoints.
- Passwords are never stored or logged in plain text.
- Failed login attempts are audited without exposing the submitted password.

## Phase 3: QR Generation

Status: `Todo`

Purpose: Generate secure QR codes that expose only signed tokens.

Features:

- Implement QR generation form validation.
- Insert QR records with `ACTIVE` status.
- Sign QR token with QR ID and expiration timestamp only.
- Return QR image to frontend.
- Add QR image preview.
- Add QR download action.
- Add copy-token action for testing.
- Add generation audit log.

Production-readiness tasks:

- Confirm QR token payload contains no personal data.
- Add tests proving token tampering is rejected.
- Add limits for name, phone, and expiration date.
- Add max allowed QR expiration duration.
- Add server-side validation for expiration dates.
- Decide whether phone is optional or required.

Exit criteria:

- Authenticated organizer can generate a QR code.
- QR can be scanned into a signed token.
- Generated token cannot be modified without rejection.
- Audit log records QR generation.

## Phase 4: QR Verification

Status: `Todo`

Purpose: Verify scanned QR tokens in the required order and produce clear outcomes.

Features:

- Verify token signature first.
- Check token expiration second.
- Load QR record by ID.
- Check QR status.
- Return stored QR data only for valid active QR records.
- Record audit logs for successful and failed verification.
- Show clear frontend result states.

Production-readiness tasks:

- Add tests for invalid signature.
- Add tests for expired token.
- Add tests for missing QR record.
- Add tests for `USED`, `REVOKED`, and `EXPIRED` statuses.
- Do not log full QR tokens.
- Add route-specific rate limit for `/qr/verify`.
- Benchmark verification path with warm server.

Exit criteria:

- Verification follows the exact required order.
- Invalid or expired tokens never return stored personal data.
- Every verification attempt creates an audit entry.

## Phase 5: QR Lifecycle Management

Status: `Todo`

Purpose: Make QR status behavior explicit and operator-friendly.

Features:

- List generated QR records.
- View QR record details.
- Revoke a QR code.
- Optionally mark a QR code as used.
- Document whether verification automatically changes `ACTIVE` to `USED`.

Recommended initial behavior:

- Do not automatically mark verified QR codes as `USED`.
- Add manual revoke first.
- Add single-use mode later only if the event process needs it.

Production-readiness tasks:

- If single-use mode is added, implement atomic `ACTIVE -> USED` update.
- Add tests for concurrent verification of the same QR code.
- Add audit entries for revocation and status changes.

Exit criteria:

- Organizers can see and manage QR status without direct database access.
- Status changes are audited.
- Single-use behavior, if enabled, is race-safe.

## Phase 6: Audit Logs

Status: `Todo`

Purpose: Make audit history transparent, searchable, and safe to expose to organizers.

Features:

- Paginated audit log API.
- Audit log table in frontend.
- Filter by action type.
- Filter by result.
- Filter by organizer.
- Filter by QR ID.
- Sort newest first.

Production-readiness tasks:

- Ensure audit records are append-only through the application.
- Keep sensitive values out of audit metadata.
- Add indexes for common filters.
- Add tests for audit visibility and pagination.
- Decide retention policy if logs grow large.

Exit criteria:

- All organizers can view complete audit history.
- Logs cannot be edited or deleted through the app.
- Large log tables remain usable through pagination.

## Phase 7: Frontend Product Polish

Status: `Todo`

Purpose: Make the app usable during a real event, especially on mobile devices.

Features:

- Responsive layout for phone and desktop.
- Clear navigation between Generate, Verify, QR Records, and Audit Logs.
- Camera-based QR scanner.
- Manual token paste fallback.
- Fast visible feedback for valid, invalid, expired, revoked, and used QR codes.
- Download and print-friendly QR view.
- Empty, loading, error, and retry states.

Production-readiness tasks:

- Test on real mobile browsers.
- Test low-light scanning.
- Test QR print quality.
- Add accessible labels and keyboard navigation.
- Avoid storing sensitive data in browser storage beyond the auth token decision.

Exit criteria:

- Organizer can verify attendees quickly from a phone.
- QR result states are hard to confuse.
- UI works at common mobile widths.

## Phase 8: Testing

Status: `Todo`

Purpose: Catch security, correctness, and workflow regressions before deployment.

Backend tests:

- QR token signing and tamper rejection.
- Login success and failure.
- Auth middleware.
- QR generation.
- QR verification result matrix.
- Audit log creation.
- Audit pagination.

Frontend tests:

- Login flow.
- Generate QR flow.
- Verify token flow.
- Audit log rendering.
- Auth expiration behavior.

Load tests:

- Warm `/qr/verify` at 100 concurrent requests.
- Track p50, p95, p99, error rate, and database errors.
- Document Render cold-start separately.

Exit criteria:

- Unit and integration tests pass.
- Load test results are recorded.
- Known platform limitations are documented.

## Phase 9: Security Hardening

Status: `Todo`

Purpose: Reduce risk before exposing the system to real organizers.

Features:

- Route-specific rate limits.
- CORS restricted to deployed frontend origin.
- Security headers.
- Strict input validation.
- Generic auth errors.
- No sensitive token logging.
- Strong secret generation and rotation notes.

Production-readiness tasks:

- Review all logs for accidental secrets or full QR tokens.
- Add centralized error handling.
- Validate all environment variables at startup.
- Consider secure HttpOnly cookies for auth.
- Consider HTTPS-only cookie mode in production.
- Add dependency audit workflow.

Exit criteria:

- Secrets remain backend-only.
- Modified QR tokens are rejected.
- Auth and QR signing use separate secrets.
- Public frontend cannot access database credentials.

## Phase 10: Deployment

Status: `Todo`

Purpose: Deploy the first hosted version on Render and Supabase.

Backend on Render:

- Build command: `pnpm install --frozen-lockfile && pnpm build:api`
- Start command: `pnpm --filter @prom-event/api start`
- Environment variables: backend-only variables from `.env.example`.

Frontend:

- Build command: `pnpm install --frozen-lockfile && pnpm build:web`
- Publish directory: `apps/web/dist`
- Environment variable: `VITE_API_URL`.

Supabase:

- Run initial migration.
- Create organizer account.
- Verify SSL connection.

Exit criteria:

- Deployed login works.
- Deployed QR generation works.
- Deployed QR verification works.
- Deployed audit log works.
- Render cold-start behavior is documented.

## Phase 11: Production Readiness Gate

Status: `Todo`

Purpose: Decide whether the free-tier deployment is enough or whether to move to paid Render or a VPS.

Must pass:

- Warm `/qr/verify` p95 below 500ms at 100 concurrent requests.
- No verification errors during load test.
- No database connection exhaustion under expected traffic.
- QR scanning works on real devices.
- Audit logs remain responsive with realistic data volume.
- Backups or export plan exists.
- Recovery steps are documented.
- Secrets are stored only in deployment environment settings.

Decision:

- If only cold start fails, upgrade Render or use a VPS.
- If database latency or limits fail, upgrade Supabase or move PostgreSQL.
- If both pass, keep the lightweight Render + Supabase deployment for the pilot.

## Phase 12: VPS Readiness

Status: `Todo`

Purpose: Keep migration simple if Render/Supabase free tier is not enough.

Features:

- Confirm API runs with plain `node dist/server.js`.
- Confirm frontend builds to static files.
- Confirm app only needs `DATABASE_URL` for database access.
- Document systemd service file.
- Document Caddy or Nginx reverse proxy config.
- Document PostgreSQL backup command.

Exit criteria:

- App can be moved without code changes.
- Only environment variables and deployment commands change.

## Recommended Implementation Order

1. Database setup and first organizer.
2. End-to-end login against Supabase.
3. End-to-end QR generation.
4. End-to-end QR verification.
5. Audit log completeness.
6. QR record management.
7. Camera scanner and mobile UX.
8. Backend tests.
9. Load testing.
10. Render deployment.
11. Production readiness review.

## Launch Checklist

- `pnpm build` passes.
- `pnpm typecheck` passes.
- `pnpm test` passes.
- Database migration has run.
- At least two organizer accounts exist.
- Login failures are audited.
- QR generation is audited.
- QR verification success and failure are audited.
- Invalid signed tokens are rejected.
- Expired tokens are rejected.
- CORS is restricted to the production frontend.
- Render backend environment variables are configured.
- Frontend `VITE_API_URL` points to the production API.
- No `.env` file is committed.
- Load test results are saved.
- Manual mobile verification test is complete.
