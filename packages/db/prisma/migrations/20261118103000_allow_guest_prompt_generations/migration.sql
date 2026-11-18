-- AlterTable
ALTER TABLE "prompt_generations"
  ALTER COLUMN "space_id" DROP NOT NULL,
  ADD COLUMN "client_key" TEXT;

-- CreateIndex
CREATE INDEX "prompt_generations_client_key_created_at_idx" ON "prompt_generations"("client_key", "created_at" DESC);
