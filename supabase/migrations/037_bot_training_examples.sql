-- ============================================
-- 037: Per-tenant bot training examples — few-shot demonstrations.
--
-- The "bot semakin pintar semakin sering dipakai" loop in V1:
--   1. Owner watches conversations in /inbox.
--   2. Spots a bot reply they don't like, OR a question the bot
--      handles awkwardly.
--   3. Goes to Settings → Bot → Training, adds an entry:
--        question        — the kind of customer message
--        ideal_answer    — what the bot SHOULD say
--        anti_pattern    — (optional) what the bot was doing that's
--                          wrong, so future replies actively avoid it
--   4. Save. Next bot turn, those triples get prepended to the system
--      prompt as worked examples — gpt-4o-mini imitates the style and
--      adopts the owner's edge-case handling.
--
-- This is curated few-shot prompting, not OpenAI fine-tuning. Once the
-- example set passes ~50 entries the path-2 escalation is to actually
-- fine-tune gpt-4o-mini on these triples, but for now the prompt is
-- enough.
-- ============================================

ALTER TABLE restaurant_settings
  ADD COLUMN IF NOT EXISTS bot_training_examples jsonb NOT NULL DEFAULT '[]'::jsonb;
