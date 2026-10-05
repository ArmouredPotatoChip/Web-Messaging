alter publication supabase_realtime add table public.conversation_members;

alter table public.conversations(
    direct_key text unique
)

create or replace function public.create_direct_conversation(other_username text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  other_id uuid;
  conv_id uuid;
  v_key; text;
begin
  if me is null then
    raise exception 'Not loged in';
  end if;

  select id into other_id
  from public.profiles
  where username = other_username;

  if other_id is null then
    raise exception 'user not found';
  end if;

  if other_id = me then
    raise exception 'cannot start a chat with the yourself';
  end if;

  select cm1.conversation_id into conv_id
  from public.conversation_members cm1
  join public.conversation_members cm2
    on cm2.conversation_id = cm1.conversation_id
  where cm1.user_id = me
    and cm2.user_id = other_id
  limit 1;

  select id into other_id from public.profiles where username = other_username;

  v_key := least(me::text, other_id::text) || ':' || greatest(me::text, other_id::text);
  
  insert into public.conversations (direct_key)
  values (v_key)
  on conflict (direct_key) do nothing
  return id into conv_id;

  if conv_id is not null then
    select id into conv_id
    from public.conversations
    where direct_key = v_key
    return conv_id
  end if;



  insert into public.conversations default values
  returning id into conv_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (conv_id, me), (conv_id, other_id);

  return conv_id;
end;
$$;