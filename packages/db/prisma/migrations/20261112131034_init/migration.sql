-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('free', 'pro', 'team');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('monthly', 'yearly');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'trialing', 'past_due', 'canceled');

-- CreateEnum
CREATE TYPE "SpaceRole" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "ComposerMode" AS ENUM ('text', 'image', 'video');

-- CreateEnum
CREATE TYPE "PromptFramework" AS ENUM ('costar', 'rise', 'care', 'cot', 'none');

-- CreateEnum
CREATE TYPE "GenerationKind" AS ENUM ('compose', 'refine', 'autopsy', 'guest_import');

-- CreateEnum
CREATE TYPE "UsageAction" AS ENUM ('compose', 'refine', 'autopsy', 'reverse_engineer');

-- CreateEnum
CREATE TYPE "CircuitStateKind" AS ENUM ('closed', 'open', 'half_open');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "preferences" JSONB NOT NULL DEFAULT '{"dismissedHotspots":{},"completedTours":{}}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "active_space_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passkeys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT,
    "public_key" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "device_type" TEXT NOT NULL,
    "backed_up" BOOLEAN NOT NULL,
    "transports" TEXT,
    "aaguid" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "passkeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL DEFAULT 'free',
    "stripe_customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_members" (
    "space_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "SpaceRole" NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_members_pkey" PRIMARY KEY ("space_id","user_id")
);

-- CreateTable
CREATE TABLE "prompt_generations" (
    "id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "user_id" TEXT,
    "kind" "GenerationKind" NOT NULL DEFAULT 'compose',
    "raw_input" TEXT NOT NULL,
    "compiled_prompt" TEXT NOT NULL,
    "draft" JSONB,
    "mode" "ComposerMode" NOT NULL,
    "framework" "PromptFramework" NOT NULL,
    "model_id" TEXT,
    "provider_id" TEXT NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "guest_interaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_prompts" (
    "id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "author_id" TEXT,
    "source_generation_id" TEXT,
    "template_id" TEXT,
    "title" VARCHAR(160) NOT NULL,
    "raw_input" TEXT NOT NULL,
    "compiled_prompt" TEXT NOT NULL,
    "mode" "ComposerMode" NOT NULL,
    "framework" "PromptFramework" NOT NULL DEFAULT 'costar',
    "model_id" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "detected_variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "share_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "use_case" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "mode" "ComposerMode" NOT NULL,
    "framework" "PromptFramework" NOT NULL,
    "framework_badge" TEXT NOT NULL,
    "compatible_models" TEXT[],
    "preview" TEXT NOT NULL,
    "compiled_template" TEXT NOT NULL,
    "default_draft" JSONB NOT NULL,
    "popularity_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL,
    "interval" "BillingInterval",
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "seats" INTEGER NOT NULL DEFAULT 1,
    "stripe_subscription_id" TEXT,
    "stripe_price_id" TEXT,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_audit_events" (
    "id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "customer_id" TEXT,
    "external_id" TEXT,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_limits" (
    "plan" "PlanTier" NOT NULL,
    "action" "UsageAction" NOT NULL,
    "is_guest" BOOLEAN NOT NULL DEFAULT false,
    "daily_limit" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_limits_pkey" PRIMARY KEY ("plan","action","is_guest")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "id" TEXT NOT NULL,
    "space_id" TEXT,
    "client_key" TEXT,
    "usage_date" DATE NOT NULL,
    "action" "UsageAction" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_circuit_states" (
    "provider_id" TEXT NOT NULL,
    "state" "CircuitStateKind" NOT NULL DEFAULT 'closed',
    "consecutive_errors" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "opened_at" TIMESTAMP(3),
    "next_probe_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_circuit_states_pkey" PRIMARY KEY ("provider_id")
);

-- CreateTable
CREATE TABLE "self_healing_incidents" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "trace_id" TEXT,
    "summary" TEXT NOT NULL,
    "remediation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'auto_resolved',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "self_healing_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_id_account_id_key" ON "accounts"("provider_id", "account_id");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "passkeys_credential_id_key" ON "passkeys"("credential_id");

-- CreateIndex
CREATE INDEX "passkeys_user_id_idx" ON "passkeys"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "spaces_stripe_customer_id_key" ON "spaces"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "space_members_user_id_idx" ON "space_members"("user_id");

-- CreateIndex
CREATE INDEX "prompt_generations_space_id_created_at_idx" ON "prompt_generations"("space_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "prompt_generations_space_id_guest_interaction_id_key" ON "prompt_generations"("space_id", "guest_interaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_prompts_share_id_key" ON "saved_prompts"("share_id");

-- CreateIndex
CREATE INDEX "saved_prompts_space_id_updated_at_idx" ON "saved_prompts"("space_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "saved_prompts_space_id_category_idx" ON "saved_prompts"("space_id", "category");

-- CreateIndex
CREATE INDEX "saved_prompts_tags_idx" ON "saved_prompts" USING GIN ("tags");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_slug_key" ON "prompt_templates"("slug");

-- CreateIndex
CREATE INDEX "prompt_templates_mode_category_idx" ON "prompt_templates"("mode", "category");

-- CreateIndex
CREATE INDEX "prompt_templates_popularity_score_idx" ON "prompt_templates"("popularity_score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_space_id_status_idx" ON "subscriptions"("space_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_audit_events_external_id_key" ON "billing_audit_events"("external_id");

-- CreateIndex
CREATE INDEX "billing_audit_events_space_id_created_at_idx" ON "billing_audit_events"("space_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "usage_counters_usage_date_idx" ON "usage_counters"("usage_date");

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_space_id_usage_date_action_key" ON "usage_counters"("space_id", "usage_date", "action");

-- CreateIndex
CREATE UNIQUE INDEX "usage_counters_client_key_usage_date_action_key" ON "usage_counters"("client_key", "usage_date", "action");

-- CreateIndex
CREATE INDEX "self_healing_incidents_created_at_idx" ON "self_healing_incidents"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_generations" ADD CONSTRAINT "prompt_generations_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_generations" ADD CONSTRAINT "prompt_generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_prompts" ADD CONSTRAINT "saved_prompts_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_prompts" ADD CONSTRAINT "saved_prompts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_prompts" ADD CONSTRAINT "saved_prompts_source_generation_id_fkey" FOREIGN KEY ("source_generation_id") REFERENCES "prompt_generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_prompts" ADD CONSTRAINT "saved_prompts_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "prompt_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_audit_events" ADD CONSTRAINT "billing_audit_events_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
