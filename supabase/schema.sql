-- Run this once in the Supabase project's SQL editor (Project → SQL Editor →
-- New query) to create the table the relay logs every p-points.com forward
-- attempt into. See README.md for how to get SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY.

create table if not exists forward_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('notify', 'poll')),
  amount text not null,
  balance text not null,
  addat text not null,
  ok boolean not null,
  response_status int not null,
  response_body text not null
);

create index if not exists forward_logs_created_at_idx on forward_logs (created_at desc);

-- Without RLS, Supabase's default grants make this table readable and
-- writable through the public REST API by anyone holding the project's anon
-- key. The app only ever talks to Supabase with the service_role key, which
-- bypasses RLS regardless, so enabling it with no policies is what makes
-- "server-only, service_role-only" (as described in README.md) actually true
-- rather than just a convention.
alter table forward_logs enable row level security;
