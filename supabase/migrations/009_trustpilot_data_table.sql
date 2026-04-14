create table if not exists trustpilot_data (
  id                uuid primary key default uuid_generate_v4(),
  business_id       uuid not null references businesses(id) on delete cascade,
  trustpilot_rating numeric(2,1),
  review_count      integer,
  trust_score       integer,
  recent_reviews    jsonb,
  fetched_at        timestamptz not null default now()
);

create index if not exists trustpilot_data_business_id_idx on trustpilot_data (business_id);

alter table trustpilot_data enable row level security;

create policy "users manage trustpilot_data for own businesses"
  on trustpilot_data for all
  using (
    business_id in (
      select id from businesses
      where project_id in (
        select id from projects where user_id = auth.uid()
      )
    )
  );
