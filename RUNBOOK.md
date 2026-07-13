# FactoPay Operational Runbook

This runbook documents critical operational procedures, system constraints, and maintenance tasks for the FactoPay backend.

## 1. System Wallet Balances (FX & Liquidity)
System wallets (e.g., `LIQUIDITY` and `SYSTEM` wallet types) are exempt from strict balance checks during cross-currency transfers, allowing them to carry negative balances representing the platform's float. 

**CRITICAL:** There is a hard safety floor set at `-1,000,000` (configurable via `SYSTEM_WALLET_FLOOR`) to prevent infinite unmonitored drift. This balance must be monitored, and liquidity must be re-injected if the balance approaches this floor to prevent legitimate cross-currency transfers from failing.

## 2. Database Connection Pooling
- **DATABASE_URL**: Must include `?pgbouncer=true`. Used for all standard CRUD operations.
- **DIRECT_URL**: Must bypass pgbouncer. Used strictly for interactive transactions requiring row-level locks (e.g., `SELECT ... FOR UPDATE`).
- **DIRECT_CONNECTION_LIMIT**: Configured to `2` by default to prevent connection starvation since these connections are held open for the duration of the transaction.

## 3. Concurrency & Locking
The system is designed to handle high concurrency securely:
- **Ledger Locks**: Row-level locks (`FOR UPDATE`) are acquired lexicographically to prevent deadlocks.
- **Lock Timeouts (55P03)**: If a Postgres lock timeout occurs under extreme contention, the `PostLedgerTransactionUseCase` will automatically retry with exponential backoff and jitter (up to 3 times).
- **Global Advisory Locks**: Used for operations that span the entire cluster but cannot use row-level locks (e.g., Blockchain Settlement caps). 

## 4. Rewards Points Expiry
Points expire 12 months after they are earned.
- **Mechanism**: The `PointsExpiryService` calculates `(Earned > 1 Year Ago) - (Total Used All Time)`. If positive, the difference is expired.
- **Operation**: `processExpiryForAllAccounts()` must be invoked periodically (e.g., via a daily cron job or BullMQ scheduled task) to sweep the system.

## 5. Webhooks & API Keys
- **Inbound Webhooks (Transak)**: Secured via HMAC-SHA256. Secret is configured via `PAYMENT_WEBHOOK_SECRET`.
- **Outbound Webhooks (B2B)**: Signed via HMAC-SHA256 and sent with the `x-factopay-signature` header.
- **API Keys**: Stored as SHA-256 hashes. B2B endpoints are dynamically rate-limited based on the tier assigned to the API key in the database (10, 60, or 300 req/sec).

## 6. Audit & Compliance
- **Audit Logs**: The global `@AuditLog()` interceptor captures all state-mutating requests (POST/PUT/PATCH/DELETE).
- **AML Rules**: Transfers exceeding €2,000 trigger a `HIGH` severity `AlertRecord` and a Slack notification via the `AmlRuleEngine`.

## 7. Operational Commands
- **Run Migrations**: `npx prisma migrate deploy`
- **Generate Prisma Client**: `npx prisma generate`
- **Run Test Suite**: `npx jest`
