-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('feature_request', 'general_feedback', 'bug_report');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('open', 'under_review', 'planned', 'completed', 'closed');

-- CreateEnum
CREATE TYPE "ReferralSource" AS ENUM ('search_engine', 'social_media', 'friend_or_colleague', 'github_or_open_source', 'blog_or_newsletter', 'ai_assistant', 'other');

-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "referral_source" "ReferralSource",
  ADD COLUMN "referral_detail" VARCHAR(200),
  ADD COLUMN "referred_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "user_feedback" (
    "id" TEXT NOT NULL,
    "space_id" TEXT,
    "user_id" TEXT,
    "client_key" TEXT,
    "kind" "FeedbackKind" NOT NULL DEFAULT 'feature_request',
    "title" VARCHAR(160),
    "message" TEXT NOT NULL,
    "contact_email" VARCHAR(254),
    "page_path" VARCHAR(255),
    "status" "FeedbackStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_feedback_kind_status_created_at_idx" ON "user_feedback"("kind", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "user_feedback_space_id_created_at_idx" ON "user_feedback"("space_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "user_feedback_user_id_created_at_idx" ON "user_feedback"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
