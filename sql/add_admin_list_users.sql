-- Run in the Supabase SQL editor (project: tqxvtsdghobustiatiqm).
-- Additive only. Safe to re-run.
--
-- One-query user list for the admin page (replaces walking every account page
-- through the auth API and joining five tables in code, which was slow).
-- Returns { total, users: [...] } for one page, newest accounts first,
-- optionally filtered by an email search. Only the server's secret key may
-- call it: it reads auth.users, which no browser role may see.
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
          'is_admin', exists (select 1 from public.app_admins a where a.user_id = p.id),
          'is_owner', exists (select 1 from public.app_admins a where a.user_id = p.id and a.is_owner)
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
