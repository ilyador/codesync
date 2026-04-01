-- Comments
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz default now()
);

create index idx_comments_task on comments(task_id);
alter table comments enable row level security;

create policy "comments_select" on comments for select using (
  exists (select 1 from tasks t join project_members pm on pm.project_id = t.project_id
          where t.id = comments.task_id and pm.user_id = auth.uid())
);
create policy "comments_insert" on comments for insert with check (user_id = auth.uid());
create policy "comments_delete" on comments for delete using (user_id = auth.uid());

-- Notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  type text not null check (type in ('status_change', 'mention', 'assignment')),
  task_id uuid references public.tasks(id) on delete cascade,
  message text not null,
  read boolean default false,
  created_at timestamptz default now()
);

create index idx_notifications_user_unread on notifications(user_id) where read = false;
alter table notifications enable row level security;

create policy "notifications_select" on notifications for select using (user_id = auth.uid());
create policy "notifications_update" on notifications for update using (user_id = auth.uid());

-- Notify assignee on task status change
create function notify_on_task_status_change()
returns trigger as $$
begin
  if old.status is distinct from new.status and new.assignee is not null then
    insert into notifications (user_id, type, task_id, message)
    values (new.assignee, 'status_change', new.id,
            'Task "' || new.title || '" moved to ' || new.status);
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_task_status_change
  after update of status on tasks
  for each row execute function notify_on_task_status_change();

-- Notify on assignment
create function notify_on_task_assignment()
returns trigger as $$
begin
  if new.assignee is not null and (old.assignee is null or old.assignee != new.assignee) then
    insert into notifications (user_id, type, task_id, message)
    values (new.assignee, 'assignment', new.id,
            'You were assigned to "' || new.title || '"');
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_task_assignment
  after update of assignee on tasks
  for each row execute function notify_on_task_assignment();

-- Realtime
alter publication supabase_realtime add table comments;
alter publication supabase_realtime add table notifications;
