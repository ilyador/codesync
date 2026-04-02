-- ============================================================
-- Migration 00010: Replace milestones + task_blockers with workstreams
-- ============================================================

-- ------------------------------------------------------------
-- 1. Create workstreams table
-- ------------------------------------------------------------
create table public.workstreams (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'complete', 'archived')),
  position integer not null default 0,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 2. Indexes
-- ------------------------------------------------------------
create index idx_workstreams_project on workstreams(project_id);
create index idx_workstreams_project_position on workstreams(project_id, position);

-- ------------------------------------------------------------
-- 3. RLS policies (project members: select/insert/update; admin-only: delete)
-- ------------------------------------------------------------
alter table workstreams enable row level security;

create policy "workstreams_select" on workstreams for select using (
  exists (select 1 from project_members where project_id = workstreams.project_id and user_id = auth.uid())
);
create policy "workstreams_insert" on workstreams for insert with check (
  exists (select 1 from project_members where project_id = workstreams.project_id and user_id = auth.uid())
);
create policy "workstreams_update" on workstreams for update using (
  exists (select 1 from project_members where project_id = workstreams.project_id and user_id = auth.uid())
);
create policy "workstreams_delete" on workstreams for delete using (
  exists (select 1 from project_members where project_id = workstreams.project_id and user_id = auth.uid() and role = 'admin')
);

-- ------------------------------------------------------------
-- 4. Enable realtime
-- ------------------------------------------------------------
alter publication supabase_realtime add table workstreams;

-- ------------------------------------------------------------
-- 5. Migrate existing milestones into workstreams (preserving UUIDs)
-- ------------------------------------------------------------
insert into workstreams (id, project_id, name, status, position, created_at)
select
  id, project_id, name,
  case when status = 'completed' then 'complete' else 'active' end,
  row_number() over (partition by project_id order by created_at),
  created_at
from milestones;

-- ------------------------------------------------------------
-- 6. Add workstream_id column to tasks
-- ------------------------------------------------------------
alter table tasks add column workstream_id uuid references public.workstreams(id) on delete set null;

-- ------------------------------------------------------------
-- 7. Copy milestone assignments to workstream_id
-- ------------------------------------------------------------
update tasks set workstream_id = milestone_id where milestone_id is not null;

-- ------------------------------------------------------------
-- 8. Add auto_continue column to tasks
-- ------------------------------------------------------------
alter table tasks add column auto_continue boolean not null default true;

-- ------------------------------------------------------------
-- 9. Index for workstream + position lookups
-- ------------------------------------------------------------
create index idx_tasks_workstream_position on tasks(workstream_id, position);

-- ------------------------------------------------------------
-- 10. Drop old milestone_id column from tasks (index first if exists)
-- ------------------------------------------------------------
drop index if exists idx_tasks_milestone_id;
alter table tasks drop column milestone_id;

-- ------------------------------------------------------------
-- 11. Drop milestones table (remove from realtime first)
-- ------------------------------------------------------------
alter publication supabase_realtime drop table milestones;
drop table public.milestones cascade;

-- ------------------------------------------------------------
-- 12. Drop task_blockers table
-- ------------------------------------------------------------
drop table public.task_blockers cascade;
