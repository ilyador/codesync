-- Profiles (extends Supabase Auth users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  initials text not null,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create function public.handle_new_user()
returns trigger as $$
declare
  full_name text;
  parts text[];
begin
  full_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
  parts := string_to_array(full_name, ' ');
  insert into public.profiles (id, name, email, initials)
  values (
    new.id,
    full_name,
    new.email,
    upper(left(parts[1], 1) || coalesce(left(parts[array_length(parts, 1)], 1), ''))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

alter table projects enable row level security;

-- Project members
create table public.project_members (
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null default 'dev' check (role in ('admin', 'dev')),
  local_path text,
  joined_at timestamptz default now(),
  primary key (project_id, user_id)
);

alter table project_members enable row level security;

-- RLS: projects visible to members
create policy "projects_select" on projects for select using (
  exists (select 1 from project_members where project_id = projects.id and user_id = auth.uid())
);
create policy "projects_insert" on projects for insert with check (created_by = auth.uid());
create policy "projects_update" on projects for update using (
  exists (select 1 from project_members where project_id = projects.id and user_id = auth.uid() and role = 'admin')
);

-- RLS: members visible to co-members, admin can manage
create policy "members_select" on project_members for select using (
  exists (select 1 from project_members pm where pm.project_id = project_members.project_id and pm.user_id = auth.uid())
);
create policy "members_insert" on project_members for insert with check (
  exists (select 1 from project_members pm where pm.project_id = project_members.project_id and pm.user_id = auth.uid() and pm.role = 'admin')
  or not exists (select 1 from project_members pm where pm.project_id = project_members.project_id)
);
create policy "members_delete" on project_members for delete using (
  exists (select 1 from project_members pm where pm.project_id = project_members.project_id and pm.user_id = auth.uid() and pm.role = 'admin')
);

-- RPC: create project + auto-add creator as admin (bypasses RLS chicken-and-egg)
create function public.create_project(p_name text)
returns uuid as $$
declare
  new_id uuid;
begin
  insert into projects (name, created_by) values (p_name, auth.uid()) returning id into new_id;
  insert into project_members (project_id, user_id, role) values (new_id, auth.uid(), 'admin');
  return new_id;
end;
$$ language plpgsql security definer;
