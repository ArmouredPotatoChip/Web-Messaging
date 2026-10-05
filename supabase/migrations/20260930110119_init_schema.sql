create table public.profiles(
    id uuid primary key references auth.users(id) on delete cascade,
    username text not null unique check (char_length(username) between 3 and 30),
    created_at timestamptz not null default now()
);

create table public.conversations (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now()
);

create table public.conversation_members (
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    joined_at timestamptz not null default now(),
    primary key (conversation_id, user_id)
);

create table public.messages(
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    sender_id uuid not null references public.profiles(id) on delete cascade,
    content text not null check (char_length(content) between  1 and 4000),
    created_at timestamptz not null default now()
);

create index messages_conversation_created_idx
    on public.messages (conversation_id, created_at desc);
create index conversation_members_user_idx
    on public.conversation_members (user_id);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$ 
begin
    insert into public.profiles(id, username)
    values (new.id, new.raw_user_meta_data ->> 'username');
    return new;
end;
$$;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

create function public.is_conversation_member(conv_id uuid)
returns boolean
language sql
security definer set search_path = ''
stable 
as $$
    select exists(
        select 1 from public.conversation_members
        where conversation_id = conv_id
        and user_id = (select auth.uid())
    );
$$;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

grant select on public.profiles, public.conversations,
                public.conversation_members, public.messages to authenticated;
grant insert on public.messages to authenticated;


create policy "only loged in members can see profiles"
  on public.profiles for select to authenticated
  using (true);

  create policy "only members can see the chats"
  on public.conversations for select to authenticated
  using (public.is_conversation_member(id));

create policy "only chat members can see other participants of chat"
  on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "members can read chats"
  on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "members can only message for themselves"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_conversation_member(conversation_id)
  );

create function public.create_direct_conversation(other_username text)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  other_id uuid;
  conv_id uuid;
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

  if conv_id is not null then
    return conv_id;
  end if;

  insert into public.conversations default values
  returning id into conv_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (conv_id, me), (conv_id, other_id);

  return conv_id;
end;
$$;

revoke execute on function public.create_direct_conversation(text) from public, anon;
grant  execute on function public.create_direct_conversation(text) to authenticated;

alter publication supabase_realtime add table public.messages;