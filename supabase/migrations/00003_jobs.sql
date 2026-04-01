-- Jobs (execution state for AI tasks)
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'paused', 'review', 'done', 'failed')),
  current_phase text,
  attempt integer default 1,
  max_attempts integer default 3,
  phases_completed jsonb default '[]',
  question text,
  answer text,
  review_result jsonb,
  started_at timestamptz default now(),
  completed_at timestamptz,
  started_by uuid references public.profiles(id)
);

create index idx_jobs_task on jobs(task_id);
create index idx_jobs_project_status on jobs(project_id, status);

alter table jobs enable row level security;

create policy "jobs_select" on jobs for select using (
  exists (select 1 from project_members where project_id = jobs.project_id and user_id = auth.uid())
);
create policy "jobs_insert" on jobs for insert with check (
  exists (select 1 from project_members where project_id = jobs.project_id and user_id = auth.uid())
);
create policy "jobs_update" on jobs for update using (
  exists (select 1 from project_members where project_id = jobs.project_id and user_id = auth.uid())
);

alter publication supabase_realtime add table jobs;
