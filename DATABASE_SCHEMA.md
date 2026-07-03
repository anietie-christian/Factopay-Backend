# FactoPay — Database Schema

> **Version:** 1.0 · **Engine:** PostgreSQL · **ORM:** Prisma  
> **Rule:** All monetary columns use `DECIMAL(18,4)`. All timestamps in UTC.

---

## 1. Schema Overview by Domain

| Domain | Tables | Owner |
|---|---|---|
| Auth & Users | `users`, `user_profiles`, `auth_sessions`, `otp_codes` | Dev 2 |
| Compliance & KYC | `kyc_records`, `kyc_documents`, `aml_flags`, `compliance_records` | Dev 2 |
| Financial Core | `wallets`, `ledger_accounts`, `ledger_entries`, `fx_rates`, `fx_quotes` | Dev 1 |
| Transactions | `recipients`, `transfers`, `transfer_events`, `blockchain_transactions` | Dev 3 + Dev 1 |
| Rewards | `reward_points`, `reward_transactions`, `reward_tiers`, `referrals` | Backend |
| Operations | `audit_logs`, `admin_users`, `roles`, `notifications` | Lead + Dev 2 |
| Gateway (B2B) | `partner_apps`, `api_keys`, `gateway_transactions`, `webhook_events` | Backend |
| Idempotency | `idempotency_keys` | Lead (Shared) |

---

## 2. Auth & Users Domain

### `users`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT uuid_generate_v4() | Unique user identifier |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | User email address |
| `phone_number` | VARCHAR(20) | UNIQUE, NOT NULL | Phone with country code |
| `password_hash` | VARCHAR(255) | NOT NULL | bcrypt/argon2 hash |
| `is_email_verified` | BOOLEAN | DEFAULT false | Email verification status |
| `is_phone_verified` | BOOLEAN | DEFAULT false | Phone verification status |
| `kyc_status` | VARCHAR(20) | DEFAULT 'UNVERIFIED' | Denormalized KYC state |
| `kyc_tier` | VARCHAR(10) | DEFAULT 'NONE' | NONE, BASIC, FULL |
| `role` | VARCHAR(20) | DEFAULT 'USER' | USER, ADMIN, SUPER_ADMIN |
| `is_active` | BOOLEAN | DEFAULT true | Account active flag |
| `last_login_at` | TIMESTAMPTZ | NULLABLE | Last successful login |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Registration timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Indexes:** `idx_users_email`, `idx_users_phone`

### `user_profiles`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Profile identifier |
| `user_id` | UUID | FK → users.id, UNIQUE | Owning user |
| `first_name` | VARCHAR(100) | NOT NULL | Legal first name |
| `last_name` | VARCHAR(100) | NOT NULL | Legal last name |
| `date_of_birth` | DATE | NULLABLE | Date of birth |
| `nationality` | VARCHAR(3) | NULLABLE | ISO 3166-1 alpha-3 |
| `country_of_residence` | VARCHAR(3) | NULLABLE | Current country |
| `address_line_1` | VARCHAR(255) | NULLABLE | Street address |
| `address_line_2` | VARCHAR(255) | NULLABLE | Apt/Suite |
| `city` | VARCHAR(100) | NULLABLE | City |
| `postal_code` | VARCHAR(20) | NULLABLE | Postal/ZIP code |
| `avatar_url` | VARCHAR(500) | NULLABLE | Profile image URL |
| `preferred_currency` | VARCHAR(3) | DEFAULT 'EUR' | Display currency |
| `preferred_language` | VARCHAR(5) | DEFAULT 'en' | Language code |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Created |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Updated |

### `auth_sessions`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Session identifier |
| `user_id` | UUID | FK → users.id | Session owner |
| `refresh_token_hash` | VARCHAR(255) | NOT NULL | Hashed refresh token |
| `device_fingerprint` | VARCHAR(255) | NULLABLE | Device ID |
| `ip_address` | VARCHAR(45) | NOT NULL | Client IP (IPv4/v6) |
| `user_agent` | TEXT | NULLABLE | Browser/app user agent |
| `is_revoked` | BOOLEAN | DEFAULT false | Token revocation flag |
| `expires_at` | TIMESTAMPTZ | NOT NULL | Refresh token expiry |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Session start |

### `otp_codes`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | OTP identifier |
| `user_id` | UUID | FK → users.id | Target user |
| `code_hash` | VARCHAR(255) | NOT NULL | Hashed OTP code |
| `type` | VARCHAR(20) | NOT NULL | EMAIL, SMS, TWO_FA |
| `attempts` | INTEGER | DEFAULT 0 | Failed attempt count |
| `max_attempts` | INTEGER | DEFAULT 5 | Max allowed attempts |
| `is_used` | BOOLEAN | DEFAULT false | Already consumed |
| `expires_at` | TIMESTAMPTZ | NOT NULL | OTP expiry (5 min) |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Created |

---

## 3. Compliance & KYC Domain

### `kyc_records`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | KYC record identifier |
| `user_id` | UUID | FK → users.id, UNIQUE | Applicant |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'UNVERIFIED' | State machine: UNVERIFIED → PENDING → UNDER_REVIEW → APPROVED / REJECTED |
| `tier` | VARCHAR(10) | DEFAULT 'NONE' | NONE, BASIC, FULL |
| `provider` | VARCHAR(50) | DEFAULT 'sumsub' | KYC provider name |
| `provider_applicant_id` | VARCHAR(255) | NULLABLE | External provider ID |
| `rejection_reason` | TEXT | NULLABLE | If REJECTED |
| `reviewed_by` | UUID | FK → users.id, NULLABLE | Admin reviewer |
| `reviewed_at` | TIMESTAMPTZ | NULLABLE | Review timestamp |
| `submitted_at` | TIMESTAMPTZ | NULLABLE | Submission timestamp |
| `approved_at` | TIMESTAMPTZ | NULLABLE | Approval timestamp |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Created |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Updated |

**State Transitions:** `UNVERIFIED → PENDING → UNDER_REVIEW → APPROVED | REJECTED → PENDING (resubmit)`

### `kyc_documents`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Document identifier |
| `kyc_record_id` | UUID | FK → kyc_records.id | Parent KYC record |
| `document_type` | VARCHAR(30) | NOT NULL | NATIONAL_ID, PASSPORT, SELFIE, PROOF_OF_ADDRESS |
| `file_url` | VARCHAR(500) | NOT NULL | S3/R2 storage URL |
| `file_hash` | VARCHAR(64) | NOT NULL | SHA-256 for integrity |
| `mime_type` | VARCHAR(50) | NOT NULL | image/jpeg, application/pdf |
| `file_size_bytes` | INTEGER | NOT NULL | File size |
| `verification_status` | VARCHAR(20) | DEFAULT 'PENDING' | PENDING, VERIFIED, REJECTED |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Upload timestamp |

### `aml_flags`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Flag identifier |
| `user_id` | UUID | FK → users.id | Flagged user |
| `transfer_id` | UUID | FK → transfers.id, NULLABLE | Related transfer |
| `flag_type` | VARCHAR(30) | NOT NULL | SANCTIONS_HIT, UNUSUAL_PATTERN, HIGH_RISK_COUNTRY, PEP_MATCH |
| `severity` | VARCHAR(10) | NOT NULL | LOW, MEDIUM, HIGH, CRITICAL |
| `description` | TEXT | NOT NULL | Flag details |
| `is_resolved` | BOOLEAN | DEFAULT false | Resolution status |
| `resolved_by` | UUID | FK → users.id, NULLABLE | Resolving admin |
| `resolved_at` | TIMESTAMPTZ | NULLABLE | Resolution time |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Created |

### `compliance_records`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Record identifier |
| `transfer_id` | UUID | FK → transfers.id | Related transfer |
| `user_id` | UUID | FK → users.id | Related user |
| `check_type` | VARCHAR(30) | NOT NULL | SANCTIONS, PEP, ADVERSE_MEDIA, WALLET_SCREENING |
| `provider` | VARCHAR(50) | NOT NULL | chainalysis, sardine, sumsub |
| `result` | VARCHAR(20) | NOT NULL | PASS, FAIL, REVIEW |
| `raw_response` | JSONB | NULLABLE | Provider response payload |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Check timestamp |

---

## 4. Financial Core Domain

### `wallets`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Wallet identifier |
| `user_id` | UUID | FK → users.id | Wallet owner |
| `currency` | VARCHAR(5) | NOT NULL | EUR, USD, GBP, USDC, GHS, NGN, KES, ZAR |
| `wallet_type` | VARCHAR(20) | NOT NULL | USER, SETTLEMENT, FEE, RESERVE, PAYOUT, LIQUIDITY |
| `stellar_public_key` | VARCHAR(56) | NULLABLE | Stellar address |
| `is_active` | BOOLEAN | DEFAULT true | Active flag |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Provisioned timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Updated |

**Indexes:** `idx_wallets_user_currency` (user_id, currency) UNIQUE for USER type  
**Note:** Balance is **never stored** — always derived from `SUM(credits) - SUM(debits)` on `ledger_entries`.  
**Locking:** `SELECT ... FOR UPDATE` on wallet row before any debit operation.

### `ledger_accounts`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Account identifier |
| `wallet_id` | UUID | FK → wallets.id | Parent wallet |
| `account_type` | VARCHAR(20) | NOT NULL | ASSET, LIABILITY, REVENUE, EXPENSE |
| `currency` | VARCHAR(5) | NOT NULL | Account currency |
| `name` | VARCHAR(100) | NOT NULL | Human-readable account name |
| `is_active` | BOOLEAN | DEFAULT true | Active flag |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Created |

### `ledger_entries` ⚠️ IMMUTABLE — INSERT ONLY

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Entry identifier |
| `transaction_id` | UUID | NOT NULL | Groups related debit/credit pairs |
| `ledger_account_id` | UUID | FK → ledger_accounts.id | Target account |
| `entry_type` | VARCHAR(6) | NOT NULL | DEBIT or CREDIT |
| `amount` | DECIMAL(18,4) | NOT NULL, CHECK (amount > 0) | Entry amount (always positive) |
| `currency` | VARCHAR(5) | NOT NULL | Entry currency |
| `description` | VARCHAR(255) | NOT NULL | Human-readable description |
| `reference_type` | VARCHAR(30) | NULLABLE | TRANSFER, FEE, REVERSAL, ADJUSTMENT |
| `reference_id` | UUID | NULLABLE | FK to transfer or other entity |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Entry timestamp |

**CRITICAL CONSTRAINTS:**
- **NO UPDATE** and **NO DELETE** grants on this table in any environment
- Reversals are posted as **new compensating entries**, never edits
- `DoubleEntryEngine` validates `SUM(debits) === SUM(credits)` per `transaction_id` before commit
- **Index:** `idx_ledger_entries_account` (ledger_account_id, created_at)
- **Index:** `idx_ledger_entries_transaction` (transaction_id)

### `fx_rates`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Rate identifier |
| `source_currency` | VARCHAR(5) | NOT NULL | From currency |
| `target_currency` | VARCHAR(5) | NOT NULL | To currency |
| `rate` | DECIMAL(18,8) | NOT NULL | Exchange rate |
| `provider` | VARCHAR(50) | NOT NULL | xe, openexchangerates, wise |
| `fetched_at` | TIMESTAMPTZ | NOT NULL | Rate fetch time |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Created |

### `fx_quotes`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Quote identifier |
| `user_id` | UUID | FK → users.id | Requesting user |
| `source_currency` | VARCHAR(5) | NOT NULL | From currency |
| `target_currency` | VARCHAR(5) | NOT NULL | To currency |
| `rate` | DECIMAL(18,8) | NOT NULL | Locked rate |
| `source_amount` | DECIMAL(18,4) | NOT NULL | Amount in source currency |
| `target_amount` | DECIMAL(18,4) | NOT NULL | Amount in target currency |
| `spread_percentage` | DECIMAL(5,4) | NOT NULL | FactoPay FX spread |
| `expires_at` | TIMESTAMPTZ | NOT NULL | 30-second expiry |
| `is_used` | BOOLEAN | DEFAULT false | Consumed by a transfer |
| `transfer_id` | UUID | FK → transfers.id, NULLABLE | Consuming transfer |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Created |

---

## 5. Transactions Domain

### `recipients`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Recipient identifier |
| `user_id` | UUID | FK → users.id | Sender who saved this recipient |
| `name` | VARCHAR(200) | NOT NULL | Recipient full name |
| `country` | VARCHAR(3) | NOT NULL | ISO 3166-1 alpha-3 |
| `payout_method` | VARCHAR(20) | NOT NULL | BANK_TRANSFER, MOBILE_MONEY, CASH_PICKUP |
| `bank_name` | VARCHAR(100) | NULLABLE | Bank name |
| `account_number` | VARCHAR(30) | NULLABLE | Bank account (encrypted) |
| `mobile_number` | VARCHAR(20) | NULLABLE | Mobile money number |
| `mobile_provider` | VARCHAR(30) | NULLABLE | MTN, MPESA, VODAFONE, etc. |
| `is_favorite` | BOOLEAN | DEFAULT false | Quick-access flag |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Created |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Updated |

### `transfers`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Transfer identifier |
| `user_id` | UUID | FK → users.id | Sender |
| `recipient_id` | UUID | FK → recipients.id | Receiver |
| `fx_quote_id` | UUID | FK → fx_quotes.id | Locked FX quote |
| `idempotency_key` | VARCHAR(64) | UNIQUE, NOT NULL | Client-provided dedup key |
| `status` | VARCHAR(25) | NOT NULL | State machine value |
| `source_currency` | VARCHAR(5) | NOT NULL | Sender's currency |
| `source_amount` | DECIMAL(18,4) | NOT NULL | Amount sent |
| `target_currency` | VARCHAR(5) | NOT NULL | Recipient's currency |
| `target_amount` | DECIMAL(18,4) | NOT NULL | Amount received |
| `fee_amount` | DECIMAL(18,4) | NOT NULL, DEFAULT 0 | FactoPay fee |
| `fee_currency` | VARCHAR(5) | NOT NULL | Fee currency |
| `fx_rate` | DECIMAL(18,8) | NOT NULL | Applied exchange rate |
| `payout_method` | VARCHAR(20) | NOT NULL | BANK_TRANSFER, MOBILE_MONEY |
| `payout_provider` | VARCHAR(50) | NULLABLE | flutterwave, kotani_pay, valr |
| `payout_reference` | VARCHAR(255) | NULLABLE | Provider's reference ID |
| `corridor` | VARCHAR(10) | NOT NULL | e.g., EUR_NGN, USD_GHS |
| `failure_reason` | TEXT | NULLABLE | If status = FAILED |
| `completed_at` | TIMESTAMPTZ | NULLABLE | Completion time |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Initiation time |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last status update |

**Transfer States:** `CREATED → PENDING_KYC → COMPLIANCE_REVIEW → FX_LOCKED → WALLET_DEBITED → BLOCKCHAIN_CONFIRMED → PAYOUT_PENDING → COMPLETED | FAILED`

### `transfer_events`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Event identifier |
| `transfer_id` | UUID | FK → transfers.id | Parent transfer |
| `from_status` | VARCHAR(25) | NULLABLE | Previous state (NULL for CREATED) |
| `to_status` | VARCHAR(25) | NOT NULL | New state |
| `metadata` | JSONB | NULLABLE | Additional context |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Transition timestamp |

### `blockchain_transactions`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Record identifier |
| `transfer_id` | UUID | FK → transfers.id | Related transfer |
| `network` | VARCHAR(20) | NOT NULL | STELLAR, POLYGON |
| `tx_hash` | VARCHAR(128) | UNIQUE, NULLABLE | On-chain transaction hash |
| `from_address` | VARCHAR(128) | NOT NULL | Sender wallet address |
| `to_address` | VARCHAR(128) | NOT NULL | Receiver wallet address |
| `asset` | VARCHAR(10) | NOT NULL | USDC, XLM |
| `amount` | DECIMAL(18,4) | NOT NULL | Amount transferred |
| `status` | VARCHAR(20) | NOT NULL | PENDING, CONFIRMED, FAILED |
| `confirmations` | INTEGER | DEFAULT 0 | Block confirmations |
| `block_number` | BIGINT | NULLABLE | Block height |
| `gas_fee` | DECIMAL(18,8) | NULLABLE | Network fee paid |
| `submitted_at` | TIMESTAMPTZ | NOT NULL | Submission time |
| `confirmed_at` | TIMESTAMPTZ | NULLABLE | Confirmation time |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Created |

---

## 6. Rewards Domain

### `reward_tiers`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Tier identifier |
| `name` | VARCHAR(20) | UNIQUE, NOT NULL | BRONZE, SILVER, GOLD, PLATINUM |
| `min_points` | INTEGER | NOT NULL | Points threshold (0, 1000, 5000, 20000) |
| `earning_rate` | INTEGER | NOT NULL | Points per $10 sent (10, 15, 20, 30) |
| `fx_bonus_pct` | DECIMAL(5,4) | DEFAULT 0 | Better FX rate percentage |
| `free_transfers_monthly` | INTEGER | DEFAULT 0 | Free transfers/month |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Created |

### `reward_points`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Points record identifier |
| `user_id` | UUID | FK → users.id, UNIQUE | Points owner |
| `total_points` | INTEGER | DEFAULT 0 | Lifetime earned points |
| `available_points` | INTEGER | DEFAULT 0 | Redeemable balance |
| `current_tier` | VARCHAR(20) | DEFAULT 'BRONZE' | Current tier |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last update |

### `reward_transactions`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Transaction identifier |
| `user_id` | UUID | FK → users.id | User |
| `type` | VARCHAR(20) | NOT NULL | EARN, REDEEM, BONUS, EXPIRE |
| `points` | INTEGER | NOT NULL | Points amount |
| `description` | VARCHAR(255) | NOT NULL | e.g., "Transfer #abc earned 20 pts" |
| `reference_type` | VARCHAR(20) | NULLABLE | TRANSFER, REFERRAL, ANNIVERSARY |
| `reference_id` | UUID | NULLABLE | Related entity ID |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Transaction time |

### `referrals`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Referral identifier |
| `referrer_id` | UUID | FK → users.id | User who referred |
| `referee_id` | UUID | FK → users.id | Referred user |
| `referral_code` | VARCHAR(20) | NOT NULL | Unique referral code |
| `status` | VARCHAR(20) | DEFAULT 'PENDING' | PENDING, COMPLETED, EXPIRED |
| `points_awarded` | INTEGER | DEFAULT 0 | Points given (50 per referral) |
| `completed_at` | TIMESTAMPTZ | NULLABLE | First transfer by referee |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Created |

---

## 7. Operations Domain

### `audit_logs` (IMMUTABLE — INSERT ONLY)

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Log identifier |
| `user_id` | UUID | NULLABLE | Acting user |
| `action` | VARCHAR(50) | NOT NULL | e.g., TRANSFER_INITIATED, KYC_APPROVED |
| `entity_type` | VARCHAR(30) | NOT NULL | Table/model affected |
| `entity_id` | UUID | NOT NULL | Affected record ID |
| `before_state` | JSONB | NULLABLE | State before change |
| `after_state` | JSONB | NULLABLE | State after change |
| `ip_address` | VARCHAR(45) | NULLABLE | Client IP |
| `user_agent` | TEXT | NULLABLE | Client user agent |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Log timestamp |

### `notifications`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Notification identifier |
| `user_id` | UUID | FK → users.id | Recipient |
| `channel` | VARCHAR(10) | NOT NULL | PUSH, SMS, EMAIL |
| `title` | VARCHAR(255) | NOT NULL | Notification title |
| `body` | TEXT | NOT NULL | Message body |
| `is_read` | BOOLEAN | DEFAULT false | Read status |
| `metadata` | JSONB | NULLABLE | Extra data |
| `sent_at` | TIMESTAMPTZ | NULLABLE | Delivery time |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Created |

### `admin_users` / `roles`

Standard RBAC tables for admin panel access. Roles: `SUPER_ADMIN`, `COMPLIANCE_OFFICER`, `SUPPORT_AGENT`, `VIEWER`.

---

## 8. Gateway (B2B) Domain

### `partner_apps`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Partner identifier |
| `name` | VARCHAR(100) | NOT NULL | Partner company name |
| `webhook_url` | VARCHAR(500) | NULLABLE | Callback URL |
| `webhook_secret` | VARCHAR(255) | NOT NULL | HMAC signing secret |
| `tier` | VARCHAR(20) | DEFAULT 'STARTER' | STARTER, GROWTH, SCALE, ENTERPRISE |
| `rate_limit_per_min` | INTEGER | DEFAULT 100 | API rate limit |
| `is_active` | BOOLEAN | DEFAULT true | Active flag |
| `ip_whitelist` | TEXT[] | NULLABLE | Allowed IP addresses |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Created |

### `api_keys`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Key identifier |
| `partner_id` | UUID | FK → partner_apps.id | Owning partner |
| `key_hash` | VARCHAR(255) | UNIQUE, NOT NULL | Hashed API key |
| `key_prefix` | VARCHAR(8) | NOT NULL | First 8 chars for identification |
| `environment` | VARCHAR(10) | NOT NULL | SANDBOX, PRODUCTION |
| `is_active` | BOOLEAN | DEFAULT true | Active flag |
| `last_used_at` | TIMESTAMPTZ | NULLABLE | Last API call |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Created |

---

## 9. Idempotency

### `idempotency_keys`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | Record identifier |
| `key` | VARCHAR(64) | UNIQUE, NOT NULL | Client-provided key |
| `user_id` | UUID | FK → users.id | Requesting user |
| `endpoint` | VARCHAR(100) | NOT NULL | Request path |
| `response_status` | INTEGER | NOT NULL | HTTP status returned |
| `response_body` | JSONB | NOT NULL | Stored response |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Created |
| `expires_at` | TIMESTAMPTZ | NOT NULL | Key expiry (24h) |

---

## 10. Entity Relationship Summary

```
users 1──* wallets 1──* ledger_accounts 1──* ledger_entries
  │
  ├── 1──1 user_profiles
  ├── 1──* auth_sessions
  ├── 1──* otp_codes
  ├── 1──1 kyc_records 1──* kyc_documents
  ├── 1──* recipients
  ├── 1──* transfers 1──* transfer_events
  │              └──1──* blockchain_transactions
  ├── 1──* aml_flags
  ├── 1──1 reward_points
  ├── 1──* reward_transactions
  ├── 1──* referrals (as referrer or referee)
  └── 1──* notifications

partner_apps 1──* api_keys
           1──* gateway_transactions

fx_quotes *──1 transfers
fx_rates (standalone reference table)
audit_logs (standalone, immutable)
idempotency_keys (standalone, TTL-based)
```

---

## 11. Critical Data Rules

1. **Money is DECIMAL(18,4)** — never `float`, never `number` in JS. Use `decimal.js`.
2. **`ledger_entries` is INSERT-only** — no UPDATE, no DELETE, in any environment.
3. **Wallet balance is derived** — `SUM(credits) - SUM(debits)`, never stored directly.
4. **All timestamps are UTC** — stored as `TIMESTAMPTZ`.
5. **Sensitive data encrypted at rest** — account numbers, phone numbers, PII.
6. **Soft deletes preferred** — use `is_active` flags, never hard delete financial records.
7. **FX quotes expire in 30 seconds** — enforced at domain layer and DB.
8. **Idempotency keys expire in 24 hours** — cleaned up via scheduled job.

---

*© 2025 FactoPay. All Rights Reserved. CONFIDENTIAL.*
