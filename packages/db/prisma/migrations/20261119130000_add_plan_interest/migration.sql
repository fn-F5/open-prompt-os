-- CreateTable
CREATE TABLE "plan_interest" (
    "id" TEXT NOT NULL,
    "space_id" TEXT,
    "user_id" TEXT,
    "client_key" TEXT,
    "email" VARCHAR(254) NOT NULL,
    "plan" VARCHAR(32) NOT NULL,
    "interval" VARCHAR(16) NOT NULL DEFAULT 'yearly',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_interest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_interest_email_created_at_idx" ON "plan_interest"("email", "created_at" DESC);

-- CreateIndex
CREATE INDEX "plan_interest_plan_created_at_idx" ON "plan_interest"("plan", "created_at" DESC);

-- CreateIndex
CREATE INDEX "plan_interest_space_id_created_at_idx" ON "plan_interest"("space_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "plan_interest" ADD CONSTRAINT "plan_interest_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_interest" ADD CONSTRAINT "plan_interest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
