-- Row-Level Security & constraints not expressible in schema.prisma.
-- Apply after `prisma migrate dev` creates the tables:  pnpm --filter @open-prompt-os/db db:rls
-- The API sets, per transaction:
--   SET LOCAL app.space_id = '<space id>';  SET LOCAL app.user_id = '<user id>';
-- Or for system-wide jobs:
--   SET LOCAL app.is_system = 'true';

-- usage_counters: exactly one owner (signed-in space XOR guest client key)
ALTER TABLE usage_counters DROP CONSTRAINT IF EXISTS usage_counters_owner_xor;
ALTER TABLE usage_counters ADD CONSTRAINT usage_counters_owner_xor
  CHECK ((space_id IS NULL) <> (client_key IS NULL));

-- subscriptions: at most one live subscription per space
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_live_per_space
  ON subscriptions (space_id) WHERE status IN ('active', 'trialing', 'past_due');

-- Tenant-scoped tables ---------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'saved_prompts', 'subscriptions',
    'billing_audit_events', 'space_members'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING (space_id = current_setting(''app.space_id'', true) OR current_setting(''app.is_system'', true) = ''true'') '
      'WITH CHECK (space_id = current_setting(''app.space_id'', true) OR current_setting(''app.is_system'', true) = ''true'')', t);
  END LOOP;
END $$;

-- prompt_generations: tenant rows by space, guest rows by client key, or system mode
ALTER TABLE prompt_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_generations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON prompt_generations;
DROP POLICY IF EXISTS generation_access ON prompt_generations;
CREATE POLICY generation_access ON prompt_generations
  USING (
    current_setting('app.is_system', true) = 'true'
    OR (space_id IS NOT NULL AND space_id = current_setting('app.space_id', true))
    OR (space_id IS NULL AND client_key = current_setting('app.client_key', true))
  )
  WITH CHECK (
    current_setting('app.is_system', true) = 'true'
    OR (space_id IS NOT NULL AND space_id = current_setting('app.space_id', true))
    OR (space_id IS NULL AND client_key = current_setting('app.client_key', true))
  );

-- Shared prompts are publicly readable via share_id
DROP POLICY IF EXISTS public_shared_read ON saved_prompts;
CREATE POLICY public_shared_read ON saved_prompts FOR SELECT USING (is_shared = true);

-- usage_counters: tenant rows by space, guest rows by client key, or system mode
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS usage_owner ON usage_counters;
CREATE POLICY usage_owner ON usage_counters
  USING (space_id = current_setting('app.space_id', true)
      OR client_key = current_setting('app.client_key', true)
      OR current_setting('app.is_system', true) = 'true')
  WITH CHECK (space_id = current_setting('app.space_id', true)
      OR client_key = current_setting('app.client_key', true)
      OR current_setting('app.is_system', true) = 'true');

-- user_feedback: tenant rows by space, guest rows by client key, or system mode
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feedback_access ON user_feedback;
CREATE POLICY feedback_access ON user_feedback
  USING (
    current_setting('app.is_system', true) = 'true'
    OR (space_id IS NOT NULL AND space_id = current_setting('app.space_id', true))
    OR (space_id IS NULL AND client_key = current_setting('app.client_key', true))
  )
  WITH CHECK (
    current_setting('app.is_system', true) = 'true'
    OR (space_id IS NOT NULL AND space_id = current_setting('app.space_id', true))
    OR (space_id IS NULL AND client_key = current_setting('app.client_key', true))
  );

-- plan_interest: tenant rows by space, guest rows by client key, or system mode
ALTER TABLE plan_interest ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_interest FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plan_interest_access ON plan_interest;
CREATE POLICY plan_interest_access ON plan_interest
  USING (
    current_setting('app.is_system', true) = 'true'
    OR (space_id IS NOT NULL AND space_id = current_setting('app.space_id', true))
    OR (space_id IS NULL AND client_key = current_setting('app.client_key', true))
  )
  WITH CHECK (
    current_setting('app.is_system', true) = 'true'
    OR (space_id IS NOT NULL AND space_id = current_setting('app.space_id', true))
    OR (space_id IS NULL AND client_key = current_setting('app.client_key', true))
  );
