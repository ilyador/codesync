alter table public.flow_steps
  add column if not exists provider_config_id uuid references public.provider_configs(id) on delete set null;

create index if not exists idx_flow_steps_provider_config_id on public.flow_steps(provider_config_id);

update public.flow_steps as step
set provider_config_id = config.id
from public.flows as flow
join public.provider_configs as config
  on config.project_id = flow.project_id
 and config.provider = case
   when step.model like 'claude:%' or step.model in ('sonnet', 'opus') then 'claude'
   when step.model like 'codex:%' then 'codex'
   when step.model like 'lmstudio:%' then 'lmstudio'
   when step.model like 'ollama:%' then 'ollama'
   when step.model like 'custom:%' then 'custom'
   else null
 end
where step.flow_id = flow.id
  and flow.provider_binding = 'flow_locked'
  and step.provider_config_id is null;

create or replace function public.replace_flow_steps(p_flow_id uuid, p_steps jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' then
    raise exception 'p_steps must be a JSON array';
  end if;

  delete from public.flow_steps where flow_id = p_flow_id;

  insert into public.flow_steps (
    flow_id,
    name,
    position,
    instructions,
    model,
    provider_config_id,
    tools,
    context_sources,
    is_gate,
    on_fail_jump_to,
    max_retries,
    on_max_retries,
    include_agents_md
  )
  select
    p_flow_id,
    step->>'name',
    coalesce((step->>'position')::integer, ordinality::integer),
    coalesce(step->>'instructions', ''),
    coalesce(step->>'model', 'opus'),
    nullif(step->>'provider_config_id', '')::uuid,
    coalesce(array(select jsonb_array_elements_text(coalesce(step->'tools', '[]'::jsonb))), '{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(coalesce(step->'context_sources', '["task_description","previous_step"]'::jsonb))), '{"task_description","previous_step"}'::text[]),
    coalesce((step->>'is_gate')::boolean, false),
    nullif(step->>'on_fail_jump_to', '')::integer,
    coalesce((step->>'max_retries')::integer, 0),
    coalesce(step->>'on_max_retries', 'pause'),
    coalesce((step->>'include_agents_md')::boolean, true)
  from jsonb_array_elements(p_steps) with ordinality as input(step, ordinality);
end;
$$;

drop index if exists idx_provider_configs_project;

alter table public.provider_configs
  drop constraint if exists provider_configs_project_id_provider_key;

create index if not exists idx_provider_configs_project on public.provider_configs(project_id);
create index if not exists idx_provider_configs_project_provider on public.provider_configs(project_id, provider);
create unique index if not exists idx_provider_configs_one_cli_per_kind
  on public.provider_configs(project_id, provider)
  where provider in ('claude', 'codex');
