-- ============================================
-- 026: Per-tenant WhatsApp Business Account credentials.
--
-- Each tenant connects their own WABA. We receive all webhooks at one URL;
-- inbound messages carry `value.metadata.phone_number_id` which we use to
-- look up the owning tenant. Outbound sends use the tenant's stored
-- access_token + phone_number_id instead of the global env fallback.
--
-- The global WHATSAPP_TOKEN / WHATSAPP_PHONE_ID env vars remain as a
-- fallback for development / single-tenant deployments — used only when
-- the tenant has no active row here.
-- ============================================

CREATE TABLE IF NOT EXISTS whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number_id text NOT NULL,                  -- Meta phone_number_id (for routing)
  waba_id text,                                   -- WhatsApp Business Account id
  display_phone text,                             -- e.g. "+62 812 ..." (display only)
  business_name text,                             -- as shown in WhatsApp profile
  access_token text NOT NULL,                     -- per-WABA system user / OAuth token
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'connected', 'disconnected', 'error')),
  status_reason text,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_accounts_phone_number_id
  ON whatsapp_accounts(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_accounts_tenant_active
  ON whatsapp_accounts(tenant_id, is_active);

DROP TRIGGER IF EXISTS trg_touch_whatsapp_accounts ON whatsapp_accounts;
CREATE TRIGGER trg_touch_whatsapp_accounts
  BEFORE UPDATE ON whatsapp_accounts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
