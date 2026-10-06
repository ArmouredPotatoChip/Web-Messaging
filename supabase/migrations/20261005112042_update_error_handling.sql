-- Step 1: one conversation per user pair
alter table public.conversations add column direct_key text unique;

-- Backfill existing conversations so old pairs are found by direct_key.
update public.conversations c
set direct_key = k.key
from (
  select
    conversation_id,
    min(user_id::text) || ':' || max(user_id::text) as key
  from public.conversation_members
  group by conversation_id
) k
where c.id = k.conversation_id
  and c.direct_key is null;

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
  where username = other_username;

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

  -- ← old "join" check and duplicate profile lookup removed

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