-- ============================================
-- 036: Per-tenant bot knowledge — owner-curated learning surface.
--
-- The product line "bot semakin pintar semakin sering dipakai" lands
-- as: every tenant has a Settings → Bot tab where the owner writes
-- restaurant-specific instructions and FAQ pairs. Both fields get
-- prepended to the bot's system prompt at every turn, so any new
-- knowledge the owner adds is live on the next message.
--
-- Two columns on restaurant_settings (one row per tenant already):
--   - bot_extra_instructions: free-form text (rules, tone notes,
--     domain knowledge: "private room min charge Rp 500k", "biasanya
--     rekomendasi dessert kalau group ≥ 4")
--   - bot_faq: jsonb array of {question, answer} pairs, surfaced
--     verbatim to the LLM so it can answer FAQs in the owner's voice
-- ============================================

ALTER TABLE restaurant_settings
  ADD COLUMN IF NOT EXISTS bot_extra_instructions text;

ALTER TABLE restaurant_settings
  ADD COLUMN IF NOT EXISTS bot_faq jsonb NOT NULL DEFAULT '[]'::jsonb;
