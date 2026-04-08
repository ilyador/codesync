alter table public.flows
  add column if not exists provider_binding text not null default 'task_selected'
  check (provider_binding in ('task_selected', 'flow_locked'));

alter table public.tasks
  add column if not exists provider_config_id uuid references public.provider_configs(id) on delete set null,
  add column if not exists provider_model text,
  add column if not exists execution_settings_locked_at timestamptz;

create index if not exists idx_tasks_provider_config_id on public.tasks(provider_config_id);

update public.flows
set provider_binding = 'task_selected'
where is_builtin = true
  and name in ('Developer', 'AI Developer', 'Bug Hunter', 'AI Bug Hunter', 'Refactorer', 'AI Refactorer', 'Tester', 'AI Tester');

update public.flows
set provider_binding = 'flow_locked'
where is_builtin = true
  and name in ('Doc Search');

update public.flow_steps as fs
set model = case
  when lower(fs.model) in ('task:selected', 'task:fast', 'task:balanced', 'task:strong') then lower(fs.model)
  when lower(fs.model) in ('opus', 'claude:opus', 'o3', 'codex:o3', 'gpt-5.4', 'codex:gpt-5.4', 'gpt-5.3-codex', 'codex:gpt-5.3-codex') then 'task:strong'
  when lower(fs.model) in ('sonnet', 'claude:sonnet', 'gpt-5.4-mini', 'codex:gpt-5.4-mini', 'gpt-5.1-codex-mini', 'codex:gpt-5.1-codex-mini') then 'task:balanced'
  else fs.model
end
from public.flows as f
where f.id = fs.flow_id
  and f.provider_binding = 'task_selected';
