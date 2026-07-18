-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSURE_REQUESTED', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransferStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "TransferStatus" ADD VALUE 'DISPUTED';

-- DropIndex
DROP INDEX "users_phone_number_key";

-- AlterTable
ALTER TABLE "kyc_documents" ALTER COLUMN "document_url" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "transfers" DROP COLUMN "currency",
ADD COLUMN     "admin_notes" TEXT,
ADD COLUMN     "admin_review_status" VARCHAR(20),
ADD COLUMN     "admin_reviewer_id" UUID,
ADD COLUMN     "cancelled_at" TIMESTAMPTZ,
ADD COLUMN     "completed_at" TIMESTAMPTZ,
ADD COLUMN     "corridor" VARCHAR(11) NOT NULL,
ADD COLUMN     "failure_reason" VARCHAR(255),
ADD COLUMN     "fee_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "fx_quote_id" VARCHAR(255),
ADD COLUMN     "recipient_id" UUID,
ADD COLUMN     "source_currency" VARCHAR(5) NOT NULL,
ADD COLUMN     "target_currency" VARCHAR(5) NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone_number_index" VARCHAR(64),
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ALTER COLUMN "phone_number" SET DATA TYPE VARCHAR(255);

-- CreateTable
CREATE TABLE "transfer_events" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_closure_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reason" VARCHAR(500),
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cooling_off_ends" TIMESTAMPTZ NOT NULL,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "account_closure_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(100),
    "signature_ts" TIMESTAMPTZ,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
    "metadata" JSONB,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_entries" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" VARCHAR(50) NOT NULL,
    "reference_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(50) NOT NULL,
    "target_type" VARCHAR(30),
    "target_id" UUID,
    "metadata" JSONB,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_records" (
    "id" UUID NOT NULL,
    "rule_name" VARCHAR(100) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "target_id" UUID,
    "target_type" VARCHAR(50),
    "metadata" JSONB,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateway_api_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key_hash" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "rate_limit_tier" INTEGER NOT NULL DEFAULT 10,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transfer_events_transfer_id_created_at_idx" ON "transfer_events"("transfer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "account_closure_requests_user_id_key" ON "account_closure_requests"("user_id");

-- CreateIndex
CREATE INDEX "webhook_events_provider_received_at_idx" ON "webhook_events"("provider", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_event_id_key" ON "webhook_events"("provider", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "points_accounts_user_id_key" ON "points_accounts"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "alert_records_status_created_at_idx" ON "alert_records"("status", "created_at");

-- CreateIndex
CREATE INDEX "alert_records_rule_name_idx" ON "alert_records"("rule_name");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_api_keys_key_hash_key" ON "gateway_api_keys"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_user_id_recipient_id_amount_source_currency_targe_key" ON "transfers"("user_id", "recipient_id", "amount", "source_currency", "target_currency", "fx_quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_index_key" ON "users"("phone_number_index");

-- AddForeignKey
ALTER TABLE "account_closure_requests" ADD CONSTRAINT "account_closure_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_accounts" ADD CONSTRAINT "points_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_entries" ADD CONSTRAINT "points_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "points_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateway_api_keys" ADD CONSTRAINT "gateway_api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

