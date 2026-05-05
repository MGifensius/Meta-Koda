-- Marketing templates support (WhatsApp Cloud API)
-- Cold outbound requires Meta-approved templates, not free-form text.

alter table campaigns
  add column if not exists template_name text,
  add column if not exists template_language text default 'en_US',
  add column if not exists template_params jsonb default '[]'::jsonb;

comment on column campaigns.template_name is 'Meta-approved template name (e.g. buranchi_promo_weekend). Required for cold outbound.';
comment on column campaigns.template_language is 'Template language code (en_US, id, etc.). Must match language registered in Meta.';
comment on column campaigns.template_params is 'JSONB array of placeholder values for template body {{1}}, {{2}}, etc. Use {{customer_name}} token to inject per-recipient name at send time.';
