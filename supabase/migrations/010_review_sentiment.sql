alter table businesses
  add column if not exists review_sentiment jsonb default null;
