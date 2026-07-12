-- CreateTable
CREATE TABLE "blockchain_transactions" (
    "id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "source_address" VARCHAR(56) NOT NULL,
    "dest_address" VARCHAR(56) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "asset_code" VARCHAR(12) NOT NULL DEFAULT 'USDC',
    "memo" VARCHAR(64),
    "tx_hash" VARCHAR(64),
    "ledger" INTEGER,
    "status" VARCHAR(25) NOT NULL,
    "error_code" VARCHAR(40),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "blockchain_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stellar_wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "public_key" VARCHAR(56) NOT NULL,
    "encrypted_secret" TEXT NOT NULL,
    "has_trustline" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "stellar_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "blockchain_transactions_transfer_id_key" ON "blockchain_transactions"("transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "blockchain_transactions_tx_hash_key" ON "blockchain_transactions"("tx_hash");

-- CreateIndex
CREATE INDEX "blockchain_transactions_status_created_at_idx" ON "blockchain_transactions"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stellar_wallets_user_id_key" ON "stellar_wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "stellar_wallets_public_key_key" ON "stellar_wallets"("public_key");
