-- ============================================================
-- Stable template identity on priority actions
-- ============================================================
-- Which deterministic template produced a priority action (null = LLM).
-- Dedup and week to week continuity match on this id instead of headline
-- text, which breaks whenever template copy is edited.

alter table priority_actions add column if not exists template_id text;

-- Backfill from every headline each template has ever used (from git history).
update priority_actions pa
set template_id = m.id
from (values
  ('no_phone_on_homepage',        'Add your phone number to the homepage'),
  ('no_recent_reviews',           'Get fresh reviews: yours have gone quiet'),
  ('no_recent_reviews',           'Get fresh reviews — yours have gone quiet'),
  ('missing_h1',                  'Add a main heading to your homepage'),
  ('no_business_hours',           'Set your opening hours on Google'),
  ('no_gbp_description',          'Check your Google Business description'),
  ('no_gbp_description',          'Write a proper Google Business description'),
  ('no_website_meta_description', 'Add a proper description to your homepage'),
  ('no_schema_markup',            'Help Google understand what your business does'),
  ('low_gbp_photos',              'Add more photos to your Google listing'),
  ('missing_alt_tags',            'Add descriptions to your website images'),
  ('no_contact_form',             'Add a contact form to your website'),
  ('no_services_listed',          'List your services clearly on your website'),
  ('no_service_areas',            'Tell Google and visitors where you work'),
  ('no_faq',                      'Add a FAQ section to your website'),
  ('no_team_page',                'Add an About or Team page to your website'),
  ('no_review_links',             'Link to your reviews from your website'),
  ('not_in_local_pack',           'Get your business into the Google map results'),
  ('low_review_count',            'Build up your Google review count'),
  ('slow_mobile_site',            'Speed up your website on mobile'),
  ('low_ai_visibility',           'Get your business mentioned by AI assistants'),
  ('no_cta',                      'Add a clear "next step" button to your homepage')
) as m(id, action)
where pa.template_id is null and pa.action = m.action;

create index if not exists priority_actions_project_template_idx
  on priority_actions (project_id, template_id) where template_id is not null;
