create table if not exists bot_chats (
  chat_id bigint primary key,
  project_id uuid references projects(id) on delete cascade,
  created_at timestamptz default now()
);

-- No RLS needed -- bot uses service role key
