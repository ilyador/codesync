-- Add position column to flows for drag-and-drop reordering
alter table public.flows add column if not exists position real not null default 0;
