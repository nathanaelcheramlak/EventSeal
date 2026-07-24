create extension if not exists "pgcrypto";

do $$
begin
  create type qr_status as enum ('ACTIVE', 'USED', 'REVOKED', 'EXPIRED');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type audit_action as enum (
    'LOGIN_SUCCESS',
    'LOGIN_FAILED',
    'QR_GENERATED',
    'QR_VERIFY_SUCCESS',
    'QR_VERIFY_FAILED'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type audit_result as enum ('SUCCESS', 'FAILURE');
exception
  when duplicate_object then null;
end $$;

create table if not exists organizers (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists qr_codes (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references organizers(id),
  name text not null,
  phone text,
  status qr_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists audit_logs (
  id bigserial primary key,
  organizer_id uuid references organizers(id),
  qr_code_id uuid references qr_codes(id),
  action audit_action not null,
  result audit_result not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_qr_codes_status on qr_codes(status);
create index if not exists idx_qr_codes_expires_at on qr_codes(expires_at);
create index if not exists idx_audit_logs_created_at on audit_logs(created_at desc);
create index if not exists idx_audit_logs_qr_code_id on audit_logs(qr_code_id);
create index if not exists idx_audit_logs_organizer_id on audit_logs(organizer_id);
