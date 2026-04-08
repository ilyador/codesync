create table if not exists public.provider_configs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text not null check (provider in ('claude', 'codex', 'lmstudio', 'ollama', 'custom')),
  label text not null,
  base_url text,
  api_key text,
  is_enabled boolean not null default true,
  supports_embeddings boolean not null default false,
  embedding_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, provider)
);

create index if not exists idx_provider_configs_project on public.provider_configs(project_id);

alter table public.provider_configs enable row level security;

create policy "provider_configs_select" on public.provider_configs for select using (
  exists (select 1 from project_members where project_id = provider_configs.project_id and user_id = auth.uid())
);
create policy "provider_configs_insert" on public.provider_configs for insert with check (
  exists (select 1 from project_members where project_id = provider_configs.project_id and user_id = auth.uid() and role = 'admin')
);
create policy "provider_configs_update" on public.provider_configs for update using (
  exists (select 1 from project_members where project_id = provider_configs.project_id and user_id = auth.uid() and role = 'admin')
);
create policy "provider_configs_delete" on public.provider_configs for delete using (
  exists (select 1 from project_members where project_id = provider_configs.project_id and user_id = auth.uid() and role = 'admin')
);

alter table public.projects
  add column if not exists embedding_provider_config_id uuid references public.provider_configs(id) on delete set null,
  add column if not exists embedding_dimensions integer;

alter table public.rag_chunks
  alter column embedding type extensions.vector using embedding::extensions.vector;

drop index if exists idx_rag_chunks_embedding;

create or replace function search_rag_chunks(
  p_project_id uuid,
  p_query_embedding text,
  p_limit integer default 5
) returns table (
  content text,
  file_name text,
  document_id uuid,
  chunk_index integer,
  similarity float
) as $$
declare
  query_vector extensions.vector := p_query_embedding::extensions.vector;
begin
  return query
  select c.content, d.file_name, c.document_id, c.chunk_index,
         1 - (c.embedding <=> query_vector) as similarity
  from rag_chunks c
  join rag_documents d on d.id = c.document_id
  where c.project_id = p_project_id
    and d.status = 'ready'
    and vector_dims(c.embedding) = vector_dims(query_vector)
  order by c.embedding <=> query_vector
  limit p_limit;
end;
$$ language plpgsql security definer;

do $$
declare
  proj record;
begin
  for proj in select id from public.projects loop
    insert into public.provider_configs (project_id, provider, label, is_enabled, supports_embeddings)
    values
      (proj.id, 'claude', 'Claude CLI', true, false),
      (proj.id, 'codex', 'Codex CLI', true, false)
    on conflict (project_id, provider) do nothing;
  end loop;
end $$;
