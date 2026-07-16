# Changelog

## [Unreleased]

### Added
- **Production Scenario Audit**: Added `docs/REAL_LIFE_SCENARIO_AUDIT.md` and `docs/SLACK_TEAM_SUMMARY.md` to document real-life user, transfer, webhook, auth, account-closure, and operations scenarios with current behavior and recommended production solutions.
- **Required Environment Validation**: Added typed required environment validation and `.env.example` so the app fails fast when core secrets or production config are missing.
- **Refresh Token Session Rotation**: Added database-backed refresh-token sessions using `jti`, hashed token storage, single-use rotation, and reuse detection.
- **Session Token Test Coverage**: Added focused unit coverage for refresh-token issuance, rotation, reuse detection, and hash mismatch handling.
- **Multi-Currency Ledger Logic**: Upgraded `DoubleEntryEngine` to group entries by currency and validate `DEBIT = CREDIT` independently for each currency.
- **FX & Liquidity Handling**: Implemented 4-way FX entry routing in `InitiateTransferUseCase`. Cross-currency transfers now correctly hit system FX and Liquidity wallets.
- **Ledger Reversal Mechanism**: Implemented `ReverseLedgerTransactionUseCase` to automatically generate inverted entries upon blockchain settlement failures.
- **Determinism**: Used `uuidv5` namespaces to ensure reversal transactions are fully idempotent.
- **Outbound Webhook Signing**: Added `OutboundWebhookService` to securely sign B2B webhooks using HMAC-SHA256 (`x-factopay-signature`).
- **Rewards Expiry Cron**: Implemented `PointsExpiryService` to properly sweep and expire unused reward points older than 12 months.
- **API Key Revocation**: `ApiKeyService` now strictly rejects revoked and expired keys.
- **Configurable Thresholds**: `SYSTEM_WALLET_FLOOR` and `DIRECT_CONNECTION_LIMIT` are now fully configurable via `.env`.

### Changed
- **HTTP Boundary Hardening**: Re-enabled Helmet CSP, added request body limits, preserved raw webhook bodies, and disabled Swagger by default in production.
- **Webhook Signature Verification**: Updated Flutterwave, Transak, and Sumsub signature checks to use raw bytes and timing-safe comparison without logging expected or received signatures.
- **Auth Token Issuance**: Routed login, MFA login, social login, social signup, and refresh through the new session-token service.
- **B2B Exposure**: Feature-flagged B2B off by default and kept rewards wired internally by default.
- **Concurrency & Idempotency**: Refactored `PostLedgerTransactionUseCase` to rely on strict `SELECT FOR UPDATE` row locks with `lock_timeout`. Replaced optimistic concurrency arrays with deterministic Postgres constraints.
- **System Float Policy**: Allowed system `LIQUIDITY` and `SYSTEM` wallets to go negative (representing float), but implemented a hard, configurable `-1,000,000` safety floor.
- **Database Connection Pooling**: Isolated unpooled interactive transactions (`DIRECT_URL`) from pooled queries, added automatic `?pgbouncer=true` validation, and tuned `DIRECT_CONNECTION_LIMIT` for high-concurrency environments.
- **Global Rate Limiting**: Activated and verified dynamic API Key rate limiting using `@nestjs/throttler`, seamlessly switching between 10, 60, and 300 req/sec tiers based on DB values.
- **Operational Runbook**: Overhauled `RUNBOOK.md` to reflect the newly hardened architecture, covering DB limits, locking mechanisms, points expiry, and webhooks.

### Fixed
- **Hardcoded Secret Fallbacks**: Removed fallback secrets from JWT strategy, PII encryption, TOTP encryption, session binding, and webhook middleware.
- **B2B Idempotency Fallback**: Removed generated fallback idempotency keys from B2B transfers; callers must provide `Idempotency-Key`.
- **Webhook Raw Body Bug**: Fixed signature verification paths that previously used reserialized JSON instead of provider-signed raw bytes.
- **Test Isolation**: Added Jest env setup and isolated Redis, Twilio, and Stellar test configuration so the full suite exits cleanly.
- **Cross-Currency Validation Bug**: Fixed the fundamental design flaw where the ledger rejected any cross-currency transfers due to mixed-currency balancing.
- **Idempotency Race Condition**: Replaced unsafe `findFirst` and application-level retry loops with atomic database locks and application-level idempotency check via `findFirst` inside the lock scope.
- **Zero-Amount Transfers**: Added explicit validation in the double-entry engine to reject zero or negative amount entries.
- **Ledger Concurrency Race Condition**: Fixed an exploit where `getWalletIdsFromEntries` queried state outside the atomic block. The query is now performed *inside* the transaction block directly before lock acquisition.
- **Postgres Lock Timeouts**: Handled the `55P03` (lock timeout) exception by injecting exponential backoff and jitter, allowing the application to self-heal during extreme load spikes.
- **Basic Auth Timing Attacks**: Secured BullMQ basic authentication using `crypto.timingSafeEqual` and strictly guarded against `undefined` payloads.
- **Settlement Global Lock Casting**: Removed the unsafe `(this.repository as any).prisma` cast in the blockchain settlement module by refactoring the lock directly into the `runInAdvisoryLock` repository interface method.
- **Logging Sweeps**: Scoured the codebase for native `console.log` statements and replaced all instances with the internal NestJS `Logger` module.
