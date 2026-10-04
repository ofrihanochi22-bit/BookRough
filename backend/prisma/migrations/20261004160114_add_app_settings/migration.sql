-- CreateEnum
CREATE TYPE "SettingKey" AS ENUM ('ANNOUNCEMENT', 'ACCENT_COLOR', 'WELCOME_TAGLINE');

-- CreateTable
CREATE TABLE "app_settings" (
    "key" "SettingKey" NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "setting_changes" (
    "id" UUID NOT NULL,
    "key" "SettingKey" NOT NULL,
    "old_value" JSONB NOT NULL,
    "new_value" JSONB NOT NULL,
    "changed_by_id" UUID,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setting_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "setting_changes_changed_at_idx" ON "setting_changes"("changed_at" DESC);

-- AddForeignKey
ALTER TABLE "setting_changes" ADD CONSTRAINT "setting_changes_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
