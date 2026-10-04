-- Run in the Supabase SQL editor (project: tqxvtsdghobustiatiqm).
-- Additive only — nothing existing is changed or removed. Safe to re-run.
--
-- Adds: the app-admin role, a settings table (holds the "sign-ups need an
-- invite code" switch, shipped OFF), invite codes with seat counts, the
-- database rule that enforces the gate on new accounts, a rate-limit log for
-- code checks, and the once-only log for the welcome email.
--
-- Every table here is server-only: row-level security is on with NO policies,
-- so only the Netlify functions (using the secret key) can read or write them.
-- The first (owner) admin row is a separate hand-run statement, not in this file.

-- 1. App admins. A separate server-only table (NOT a user_profiles column):
--    user_profiles is publicly readable and users can edit their own row, so a
--    flag there could be faked. `is_owner` marks the permanent admin, who can
--    never be removed (enforced by the trigger below as well as by the app).
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_owner boolean not null default false,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

create or replace function public.protect_owner_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.is_owner then
    raise exception 'The owner admin cannot be removed.';
  end if;
  if tg_op = 'UPDATE' and old.is_owner and not new.is_owner then
    raise exception 'The owner admin cannot be demoted.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists protect_owner_admin on public.app_admins;
create trigger protect_owner_admin
  before update or delete on public.app_admins
  for each row execute function public.protect_owner_admin();

-- 2. App settings (key/value). Ships with sign-up OPEN.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

insert into public.app_settings (key, value)
values ('signup_requires_invite', 'false'::jsonb)
on conflict do nothing;

-- 3. Invite codes and who redeemed them.
create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  code_normalized text generated always as (upper(btrim(code))) stored,
  label text,
  max_uses integer,                       -- null = unlimited seats
  redeemed_count integer not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (max_uses is null or max_uses >= 1),
  check (redeemed_count >= 0)
);
create unique index if not exists invite_codes_code_unique
  on public.invite_codes (code_normalized) where deleted_at is null;
alter table public.invite_codes enable row level security;
revoke all on public.invite_codes from anon, authenticated;

create table if not exists public.invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.invite_codes(id),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  redeemed_at timestamptz not null default now()
);
create index if not exists invite_redemptions_code on public.invite_redemptions (code_id);
alter table public.invite_redemptions enable row level security;
revoke all on public.invite_redemptions from anon, authenticated;

-- 4. Rate limit for the invite-code check (one row per attempt, hashed IP).
create table if not exists public.signup_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists signup_attempts_ip_time on public.signup_attempts (ip_hash, created_at desc);
alter table public.signup_attempts enable row level security;
revoke all on public.signup_attempts from anon, authenticated;

-- 5. Welcome email: one row per person, so it can only ever send once.
create table if not exists public.welcome_email_sends (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.welcome_email_sends enable row level security;
revoke all on public.welcome_email_sends from anon, authenticated;

-- Everyone who already has an account is marked as welcomed, so turning this
-- on can never email a current user.
insert into public.welcome_email_sends (user_id)
select id from auth.users
on conflict do nothing;

-- 6. The sign-up gate. Runs inside the sign-up's own transaction, so it can't
--    be bypassed by calling the auth API directly, and a rejected sign-up
--    never uses up a seat.
--
--    BEFORE INSERT: decides allow/reject, and counts the seat atomically (the
--    conditional UPDATE means that with one seat left, two simultaneous
--    sign-ups can't both win). A supplied code is counted even when the gate
--    is off, so campaigns are measured either way; an invalid code never
--    blocks sign-up while the gate is off.
create or replace function public.enforce_signup_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  gate_on boolean;
  supplied text;
  matched uuid;
begin
  -- Hand the matched code id to the AFTER trigger through a setting that
  -- lasts only for this transaction (not through user metadata, which a
  -- visitor could fake).
  perform pg_catalog.set_config('passports.invite_code_id', '', true);

  select coalesce(value = 'true'::jsonb, false) into gate_on
  from public.app_settings where key = 'signup_requires_invite';
  gate_on := coalesce(gate_on, false);

  supplied := upper(btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));

  if supplied <> '' then
    update public.invite_codes
    set redeemed_count = redeemed_count + 1
    where code_normalized = supplied
      and active
      and deleted_at is null
      and (expires_at is null or expires_at > now())
      and (max_uses is null or redeemed_count < max_uses)
    returning id into matched;
  end if;

  if matched is not null then
    perform pg_catalog.set_config('passports.invite_code_id', matched::text, true);
    return new;
  end if;

  if gate_on then
    raise exception 'signup_requires_invite';
  end if;

  return new;
end;
$$;

-- AFTER INSERT: records who redeemed which code.
create or replace function public.record_invite_redemption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  code_id_text text := pg_catalog.current_setting('passports.invite_code_id', true);
begin
  if code_id_text is not null and code_id_text <> '' then
    insert into public.invite_redemptions (code_id, user_id, email)
    values (code_id_text::uuid, new.id, coalesce(new.email, ''));
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_signup_invite on auth.users;
create trigger enforce_signup_invite
  before insert on auth.users
  for each row execute function public.enforce_signup_invite();

drop trigger if exists record_invite_redemption on auth.users;
create trigger record_invite_redemption
  after insert on auth.users
  for each row execute function public.record_invite_redemption();

-- Rollback, if ever needed: flip the switch off in the admin page, or
--   update public.app_settings set value = 'false'::jsonb where key = 'signup_requires_invite';
-- To remove the gate entirely:
--   drop trigger enforce_signup_invite on auth.users;
--   drop trigger record_invite_redemption on auth.users;
