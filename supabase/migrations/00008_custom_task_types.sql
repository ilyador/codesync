-- 00008_custom_task_types.sql
-- Project-level custom task type registry.
-- Each project can define its own task types that appear in the dropdown
-- alongside built-in types. Each custom type maps to a built-in pipeline
-- (feature, bug-fix, refactor, test) for phase execution.

create table custom_task_types (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text not null default '',
  pipeline text not null default 'feature',
  created_at timestamptz not null default now(),
  unique(project_id, name)
);
