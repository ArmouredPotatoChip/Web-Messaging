create function public.is_username_available(p_username text)
returns boolean
language sql
security definer set search_path = ''
stable
as $$
  select not exists (
    select 1 from public.profiles
    where username = lower(trim(p_username))
  );
$$;

revoke execute on function public.is_username_available(text) from public;
grant  execute on function public.is_username_available(text) to anon, authenticated;
