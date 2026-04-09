alter table public.provider_configs
  add column if not exists task_config jsonb not null default '{}'::jsonb;

alter table public.provider_configs
  drop constraint if exists provider_configs_project_id_provider_key;

create unique index if not exists idx_provider_configs_single_cli
  on public.provider_configs(project_id, provider)
  where provider in ('claude', 'codex');

update public.provider_configs
set task_config = jsonb_build_object(
  'default_model', 'sonnet',
  'balanced_model', 'sonnet',
  'strong_model', 'opus',
  'selectable_models', jsonb_build_array('sonnet', 'opus'),
  'model_capabilities', jsonb_build_object(
    'sonnet', jsonb_build_object(
      'supports_tools', true,
      'supported_tools', jsonb_build_array(),
      'supports_images', false,
      'supports_reasoning', true,
      'supported_reasoning_levels', jsonb_build_array('low', 'medium', 'high', 'max'),
      'supports_subagents', true,
      'context_window', null,
      'supports_structured_output', true
    ),
    'opus', jsonb_build_object(
      'supports_tools', true,
      'supported_tools', jsonb_build_array(),
      'supports_images', false,
      'supports_reasoning', true,
      'supported_reasoning_levels', jsonb_build_array('low', 'medium', 'high', 'max'),
      'supports_subagents', true,
      'context_window', null,
      'supports_structured_output', true
    )
  )
)
where provider = 'claude'
  and (task_config is null or task_config = '{}'::jsonb);

update public.provider_configs
set task_config = jsonb_build_object(
  'default_model', 'gpt-5.4',
  'balanced_model', 'gpt-5.4-mini',
  'strong_model', 'gpt-5.4',
  'selectable_models', jsonb_build_array('gpt-5.4', 'gpt-5.4-mini', 'o3'),
  'model_capabilities', jsonb_build_object(
    'gpt-5.4', jsonb_build_object(
      'supports_tools', true,
      'supported_tools', jsonb_build_array(),
      'supports_images', false,
      'supports_reasoning', true,
      'supported_reasoning_levels', jsonb_build_array('low', 'medium', 'high', 'max'),
      'supports_subagents', true,
      'context_window', null,
      'supports_structured_output', true
    ),
    'gpt-5.4-mini', jsonb_build_object(
      'supports_tools', true,
      'supported_tools', jsonb_build_array(),
      'supports_images', false,
      'supports_reasoning', true,
      'supported_reasoning_levels', jsonb_build_array('low', 'medium', 'high', 'max'),
      'supports_subagents', true,
      'context_window', null,
      'supports_structured_output', true
    ),
    'o3', jsonb_build_object(
      'supports_tools', true,
      'supported_tools', jsonb_build_array(),
      'supports_images', false,
      'supports_reasoning', true,
      'supported_reasoning_levels', jsonb_build_array('low', 'medium', 'high', 'max'),
      'supports_subagents', true,
      'context_window', null,
      'supports_structured_output', true
    )
  )
)
where provider = 'codex'
  and (task_config is null or task_config = '{}'::jsonb);
