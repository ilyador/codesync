alter table public.tasks
  add column if not exists execution_settings_locked_job_id uuid references public.jobs(id) on delete set null;

create index if not exists idx_tasks_execution_settings_locked_job_id
  on public.tasks(execution_settings_locked_job_id);
