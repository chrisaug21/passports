-- Run in the Supabase SQL editor (project: tqxvtsdghobustiatiqm).
-- Additive; safe to re-run.
--
-- Removing an admin is now a soft delete (like everything else in the app):
-- the row stays, stamped with when and by whom, so there is a record of who
-- held admin access and who granted it. An admin counts only while
-- `deleted_at` is null; granting again clears it.
alter table public.app_admins
  add column if not exists deleted_at timestamptz,
  add column if not exists removed_by uuid references auth.users(id) on delete set null;

-- The owner can't be removed by soft delete either (still not by hard delete
-- or demotion).
create or replace function public.protect_owner_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.is_owner then
    raise exception 'The owner admin cannot be removed.';
  end if;
  if tg_op = 'UPDATE' and old.is_owner and (not new.is_owner or new.deleted_at is not null) then
    raise exception 'The owner admin cannot be removed or demoted.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- The admin Users list must ignore removed admins.
create or replace function public.admin_list_users(p_search text, p_limit integer, p_offset integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with matched as (
    select u.id, u.email, u.created_at, u.last_sign_in_at
    from auth.users u
    where coalesce(p_search, '') = ''
       or u.email ilike '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
  ),
  page as (
    select * from matched
    order by created_at desc
    limit greatest(coalesce(p_limit, 50), 1)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'users', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'email', p.email,
          'created_at', p.created_at,
          'last_sign_in_at', p.last_sign_in_at,
          'name', nullif(btrim(coalesce(up.first_name, '') || ' ' || coalesce(up.last_name, '')), ''),
          'trip_count', (select count(*) from public.trip_members tm where tm.user_id = p.id and tm.deleted_at is null),
          'joined_via', (
            select coalesce(nullif(ic.label, ''), ic.code)
            from public.invite_redemptions r
            join public.invite_codes ic on ic.id = r.code_id
            where r.user_id = p.id
          ),
          'is_admin', exists (select 1 from public.app_admins a where a.user_id = p.id and a.deleted_at is null),
          'is_owner', exists (select 1 from public.app_admins a where a.user_id = p.id and a.is_owner and a.deleted_at is null)
        )
        order by p.created_at desc
      )
      from page p
      left join public.user_profiles up on up.id = p.id
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.admin_list_users(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_users(text, integer, integer) to service_role;
