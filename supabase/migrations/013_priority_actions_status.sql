-- Add status, note, actioned_at to priority_actions for queue and action tracking

alter table priority_actions
  add column if not exists status      text not null default 'active'
    check (status in ('active','snoozed','completed','queued')),
  add column if not exists note        text,
  add column if not exists actioned_at timestamptz;

-- Existing rows are all active
update priority_actions set status = 'active' where status is null;

create index if not exists priority_actions_project_status
  on priority_actions (project_id, status);
