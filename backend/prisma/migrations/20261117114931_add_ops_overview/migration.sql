-- CreateEnum
CREATE TYPE "OpsSource" AS ENUM ('VERCEL_USAGE', 'IMAGE_CLEANUP', 'PRUNE_DEPLOYMENTS');

-- CreateTable
CREATE TABLE "ops_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" "OpsSource" NOT NULL,
    "captured_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "deleted_count" INTEGER NOT NULL DEFAULT 0,
    "written_by_id" UUID,

    CONSTRAINT "ops_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_app_opens" (
    "day" DATE NOT NULL,
    "signed_in" INTEGER NOT NULL DEFAULT 0,
    "signed_out" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_app_opens_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE INDEX "ops_snapshots_source_captured_at_idx" ON "ops_snapshots"("source", "captured_at" DESC);

-- CreateIndex
CREATE INDEX "ops_snapshots_source_deleted_count_captured_at_idx" ON "ops_snapshots"("source", "deleted_count", "captured_at" DESC);

-- CreateIndex
CREATE INDEX "ops_snapshots_received_at_idx" ON "ops_snapshots"("received_at");

-- CreateIndex
CREATE INDEX "ops_snapshots_written_by_id_idx" ON "ops_snapshots"("written_by_id");

-- AddForeignKey
ALTER TABLE "ops_snapshots" ADD CONSTRAINT "ops_snapshots_written_by_id_fkey" FOREIGN KEY ("written_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written: Prisma cannot express these, and `prisma migrate diff` does not
-- see them (docs/features/admin-overview.md §3).
ALTER TABLE "ops_snapshots" ADD CONSTRAINT "ops_snapshots_deleted_nonneg"
  CHECK ("deleted_count" >= 0);
ALTER TABLE "daily_app_opens" ADD CONSTRAINT "daily_app_opens_nonneg"
  CHECK ("signed_in" >= 0 AND "signed_out" >= 0);
