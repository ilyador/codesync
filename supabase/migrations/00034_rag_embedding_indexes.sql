create or replace function sync_rag_chunks_project_embedding_index(
  p_project_id uuid,
  p_dimensions integer
) returns void as $$
declare
  index_prefix text := format('idx_rag_chunks_embedding_%s_', replace(p_project_id::text, '-', ''));
  existing_index record;
  expected_index_name text;
begin
  for existing_index in
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and indexname like index_prefix || '%'
  loop
    execute format('drop index if exists public.%I', existing_index.indexname);
  end loop;

  if p_dimensions is null or p_dimensions <= 0 then
    return;
  end if;

  expected_index_name := format('%s%s', index_prefix, p_dimensions);
  execute format(
    'create index if not exists %I on public.rag_chunks using hnsw ((embedding::extensions.vector(%s)) extensions.vector_cosine_ops) where project_id = %L and vector_dims(embedding) = %s',
    expected_index_name,
    p_dimensions,
    p_project_id,
    p_dimensions
  );
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke all on function public.sync_rag_chunks_project_embedding_index(uuid, integer) from public;
revoke all on function public.sync_rag_chunks_project_embedding_index(uuid, integer) from anon;
revoke all on function public.sync_rag_chunks_project_embedding_index(uuid, integer) from authenticated;
grant execute on function public.sync_rag_chunks_project_embedding_index(uuid, integer) to service_role;

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
  query_dimensions integer := vector_dims(query_vector);
begin
  if query_dimensions is null or query_dimensions <= 0 then
    return;
  end if;

  return query execute format(
    'select c.content, d.file_name, c.document_id, c.chunk_index,
            1 - ((c.embedding::extensions.vector(%1$s)) <=> ($1::extensions.vector(%1$s))) as similarity
     from public.rag_chunks c
     join public.rag_documents d on d.id = c.document_id
     where c.project_id = $2
       and d.status = ''ready''
       and vector_dims(c.embedding) = %1$s
     order by (c.embedding::extensions.vector(%1$s)) <=> ($1::extensions.vector(%1$s))
     limit $3',
    query_dimensions
  ) using query_vector, p_project_id, p_limit;
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke all on function public.search_rag_chunks(uuid, text, integer) from public;
revoke all on function public.search_rag_chunks(uuid, text, integer) from anon;
revoke all on function public.search_rag_chunks(uuid, text, integer) from authenticated;
grant execute on function public.search_rag_chunks(uuid, text, integer) to service_role;

do $$
declare
  proj record;
begin
  for proj in
    select id, embedding_dimensions
    from public.projects
    where embedding_dimensions is not null
  loop
    perform sync_rag_chunks_project_embedding_index(proj.id, proj.embedding_dimensions);
  end loop;
end $$;
