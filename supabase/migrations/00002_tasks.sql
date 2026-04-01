-- Milestones
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  deadline date,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz default now()
);

create index idx_milestones_project on milestones(project_id);
alter table milestones enable row level security;

create policy "milestones_select" on milestones for select using (
  exists (select 1 from project_members where project_id = milestones.project_id and user_id = auth.uid())
);
create policy "milestones_insert" on milestones for insert with check (
  exists (select 1 from project_members where project_id = milestones.project_id and user_id = auth.uid())
);
create policy "milestones_update" on milestones for update using (
  exists (select 1 from project_members where project_id = milestones.project_id and user_id = auth.uid())
);
create policy "milestones_delete" on milestones for delete using (
  exists (select 1 from project_members where project_id = milestones.project_id and user_id = auth.uid() and role = 'admin')
);

-- Tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  description text default '',
  type text not null default 'feature',
  mode text not null default 'ai' check (mode in ('ai', 'human')),
  effort text not null default 'high' check (effort in ('low', 'medium', 'high', 'max')),
  multiagent text not null default 'auto' check (multiagent in ('auto', 'yes')),
  status text not null default 'backlog' check (status in ('backlog', 'todo', 'in_progress', 'paused', 'review', 'done', 'canceled')),
  assignee uuid references public.profiles(id),
  milestone_id uuid references public.milestones(id) on delete set null,
  position integer not null default 0,
  images text[] default '{}',
  followup_notes text,
  created_at timestamptz default now(),
  completed_at timestamptz,
  created_by uuid references public.profiles(id)
);

create index idx_tasks_project_status on tasks(project_id, status);
create index idx_tasks_project_position on tasks(project_id, position);
alter table tasks enable row level security;

create policy "tasks_select" on tasks for select using (
  exists (select 1 from project_members where project_id = tasks.project_id and user_id = auth.uid())
);
create policy "tasks_insert" on tasks for insert with check (
  exists (select 1 from project_members where project_id = tasks.project_id and user_id = auth.uid())
);
create policy "tasks_update" on tasks for update using (
  exists (select 1 from project_members where project_id = tasks.project_id and user_id = auth.uid())
);
create policy "tasks_delete" on tasks for delete using (
  exists (select 1 from project_members where project_id = tasks.project_id and user_id = auth.uid())
);

-- Task blockers (dependency graph)
create table public.task_blockers (
  task_id uuid not null references public.tasks(id) on delete cascade,
  blocked_by uuid not null references public.tasks(id) on delete cascade,
  primary key (task_id, blocked_by)
);

alter table task_blockers enable row level security;

create policy "blockers_select" on task_blockers for select using (
  exists (select 1 from tasks t join project_members pm on pm.project_id = t.project_id where t.id = task_blockers.task_id and pm.user_id = auth.uid())
);
create policy "blockers_insert" on task_blockers for insert with check (
  exists (select 1 from tasks t join project_members pm on pm.project_id = t.project_id where t.id = task_blockers.task_id and pm.user_id = auth.uid())
);
create policy "blockers_delete" on task_blockers for delete using (
  exists (select 1 from tasks t join project_members pm on pm.project_id = t.project_id where t.id = task_blockers.task_id and pm.user_id = auth.uid())
);

-- Enable realtime for tasks
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table milestones;
