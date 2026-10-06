-- Usernames keep their original case; uniqueness and lookups ignore case.
alter table public.profiles drop constraint profiles_username_key;
create unique index profiles_username_lower_key on public.profiles (lower(username));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
    insert into public.profiles(id, username)
    values (new.id, trim(new.raw_user_meta_data ->> 'username'));
    return new;
end;
$$;

create or replace function public.is_username_available(p_username text)
returns boolean
language sql
security definer set search_path = ''
stable
as $$
  select not exists (
    select 1 from public.profiles
    where lower(username) = lower(trim(p_username))
  );
$$;

create or replace function public.create_direct_conversation(other_username text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  other_id uuid;
  conv_id uuid;
  v_key text;
begin
  if me is null then
    raise exception using
      errcode = 'PT401',
      message = 'User not logged in',
      hint    = 'USER_NOT_LOGGED_IN';
  end if;

  select id into other_id
  from public.profiles
  where lower(username) = lower(trim(other_username));

  if other_id is null then
    raise exception using
      errcode = 'PT404',
      message = 'User not found',
      hint    = 'USER_NOT_FOUND';
  end if;

  if other_id = me then
    raise exception using
      errcode = 'PT409',
      message = 'Cannot start a chat with yourself',
      hint    = 'CHAT_WITH_SELF';
  end if;

  v_key := least(me::text, other_id::text) || ':' || greatest(me::text, other_id::text);

  insert into public.conversations (direct_key)
  values (v_key)
  on conflict (direct_key) do nothing
  returning id into conv_id;

  if conv_id is null then
    select id into conv_id
    from public.conversations
    where direct_key = v_key;
    return conv_id;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  values (conv_id, me), (conv_id, other_id);

  return conv_id;
end;
$$;
