# FactoPay Modules — Progress & Change Log

This file tracks the ownership, development status, and recent changes of each bounded context module within `src/modules/`.

## Module Assignment & Status

| Module | Scope / Bounded Context | Owner | Status |
|---|---|---|---|
| `auth-identity` | User registration, login, OTP, JWT, Passport strategy | **Oscar** | Completed |
| `kyc-management` | KYC state machine, document uploads, Sumsub mocks | **Oscar** | Completed |
| `blockchain-settlement` | Stellar SDK wrapper, on-chain transactions, testnet ops | **Oscar** | Completed |
| `audit-compliance` | Global audit interceptor, compliance checks | **Oscar** | Pending |
| `wallet-ledger` | Double-entry engine, wallet provisioning, balance derivation | **Christian** | Pending |
| `transfer-engine` | FX rate locking, transfer orchestration | **Christian** | Completed |
| `gateway-integrations` | Webhook verification (Flutterwave, Transak) | **Christian** | Completed |
| `shared` | Exceptions, value objects, global middleware, guards, idempotency | **Christian** | Completed |

---

## Recent Changes
- **production readiness (Security/Config):** Christian removed hardcoded secret fallbacks, added required env validation, created `.env.example`, re-enabled Helmet CSP, added body limits, and disabled Swagger by default in production.
- **auth-identity (Refresh Sessions):** Christian introduced database-backed refresh-token sessions with `jti`, hashed refresh-token storage, single-use rotation, reuse detection, and focused test coverage.
- **gateway-integrations (Webhook Integrity):** Christian updated Flutterwave, Transak, and Sumsub verification to use preserved raw request bytes and timing-safe comparisons.
- **b2b-gateway (Idempotency):** Christian removed generated fallback idempotency keys; B2B callers must now send `Idempotency-Key`. B2B exposure is feature-flagged off by default.
- **documentation (Scenario Audit):** Christian added `docs/REAL_LIFE_SCENARIO_AUDIT.md` and `docs/SLACK_TEAM_SUMMARY.md` for team review and production planning.
- **blockchain-settlement (Edge Cases & Concurrency):** Oscar implemented a 20% network fee buffer for Stellar gas spikes, a 3-attempt exponential backoff retry loop for resilient ledger submissions, a Redis-backed `WalletLockManager` to resolve concurrency/sequence number collisions, and fully documented the context in `docs/BLOCKCHAIN_SETTLEMENT.md`.
- **shared (Type Fixes):** Oscar fixed compilation errors by exporting the `CurrencyCode` type alias from `currency.vo.ts`.
- **infrastructure (Docker):** Oscar optimized `.dockerignore` using recursive exclusions (shrinking build context from 720MB to <5MB) and created a database seeder (`prisma/seed.ts`) with a cascade-truncation routine to populate test users and transaction histories.
- **transfer-engine (FX Rates):** Christian implemented the `GetLiveRatesUseCase` and `LockFxQuoteUseCase` which retrieves live rates and caches quotes in Redis for exactly 30 seconds using `ioredis`. Enforced `FxQuoteExpiredException` inside the transfer orchestration to protect against rate slippage.
- **transfer-engine (Orchestration):** Christian implemented the `InitiateTransferUseCase` orchestration logic, successfully incorporating Prisma `$transaction` and raw row-level locking for secure debits.
- **shared (Security/Idempotency):** Christian implemented a Redis-backed `IdempotencyInterceptor` (`setNxWithExpiry`) that strictly locks an `Idempotency-Key` for 120s to prevent double spending and caches successful responses. The `TransferController` is now guarded by `@RequiresIdempotency()`. Refactored RxJS pipeline using `mergeMap` and `from` to resolve Redis transactions synchronously, repairing test suite failures.
- **shared (Value Objects):** Christian strictly locked down Domain-Driven Design Value Objects. `Money` now strictly enforces positive values, exact 4-decimal precision (via `decimal.js`), and binds to a strictly validated `Currency` class. `Uuid` object built to enforce UUIDv4 Regex.
- **shared (Redis Service):** Christian/Oscar registered and exported `RedisService` in `SharedModule` to fix dependency injection errors in consumer modules like `TransferEngineModule`.
- **shared (API Gateway):** Christian successfully registered the global `ThrottlerGuard` using `@nestjs/throttler` in `app.module.ts`. Global API limit is set to 120 requests/min, while sensitive auth routes strictly override this to 10 requests/min to prevent brute forcing.
- **gateway-integrations:** Christian implemented the `WebhookSignatureMiddleware` to strictly verify HMAC SHA-256 signatures for inbound payment webhooks.
- **kyc-management (State Machine & Webhooks):** Oscar completed the `kyc-management` bounded context. Set up `SumsubProviderAdapter` and `SumsubMockAdapter` conditionally, implemented endpoints for profile submission, verification initiation, status check, and webhook signatures. Grouped under the `KYC` tag in Swagger and fixed route prefix.
- **transfer-engine (KYC Wiring):** Oscar/Christian wired up the `InitiateTransferUseCase` to check user `kycStatus` and enforce monthly transfer limits matching the user's `kycTier`.

---

## Integration Requests for Christian (Lead Dev) [COMPLETED]

The integration requests to support the end-to-end integration of the completed `auth-identity` module are now successfully set up in the `shared` module:

1. **`PrismaService`** (Completed):
   - **Path**: `src/modules/shared/infrastructure/database/prisma.service.ts`
   - **Details**: Exposed NestJS client wrapper for Prisma database connection.
2. **`FactoPayException` Hierarchy** (Completed):
   - **Path**: `src/modules/shared/domain/exceptions/`
   - **Details**: Added auth-specific exceptions (`EmailAlreadyExistsException`, `InvalidOtpException`, etc.) mapping to standard API error responses.
3. **SMS & Email Transport Adapters** (Completed):
   - **Path**: `src/modules/shared/infrastructure/notifications/`
   - **Details**: Setup integration adapters for **SendGrid** (Email OTP) and **Twilio** (SMS OTP) to allow OTP code delivery.

---

## Change Log

### July 12, 2026
- **Blockchain Settlement Edge Cases & Safety**: Oscar integrated network fee buffers (20% above base fee), a robust retry loop (3 retry attempts with exponential backoff), and built a Redis-backed concurrency locker (`WalletLockManager`) to prevent sequence number collisions during concurrent settlements.
- **Settlement Documentation**: Produced detailed developer guidelines in `docs/BLOCKCHAIN_SETTLEMENT.md` for end-to-end transaction flows and production mainnet migration instructions.
- **Docker Context Size Reduction**: Optimized `.dockerignore` to ignore intermediate agent artifacts and logs, reducing build transfer context from 720MB to under 5MB.
- **Shared Type Export Fix**: Added the missing `CurrencyCode` type export in `currency.vo.ts` to allow successful typescript compilation of transfer-engine dependencies.
- **Database Drift Resolution & Seeding**: Synchronized the Neon database with Prisma schema definitions using `prisma db push` to establish missing tables, and wrote/executed a robust database seeder using raw CASCADE truncations to seed rich test data across kyc, auth, and blockchain modules.
- **Shared Kernel Value Objects**: Christian fully implemented and locked down Guarded Value Objects (`Money`, `Currency`, and `UUID`). Rebuilt `money.vo.ts` to strictly enforce `amount >= 0`, mitigating negative value injection vulnerabilities, and fixed precision to 4 decimal places using `decimal.js`. Rebuilt `currency.vo.ts` from a simple type to a validated class enforcing ISO 4217 codes. Created `uuid.vo.ts` with strict Regex validation.
- **Shared Domain Exceptions**: Mapped invalid value object creations to `InvalidMoneyException`, `InvalidCurrencyException`, and `InvalidUuidException` (HTTP 400 Bad Request).

### July 09, 2026
- **KYC Management Bounded Context**: Completed the KYC management module including domain events, Prisma repository implementation, mock and production Sumsub providers, application use cases (`SubmitBasicProfile`, `InitiateKycCheck`, `GetKycStatus`, `HandleKycWebhook`), and controller endpoints. Grouped endpoints in Swagger under the 'KYC' tag and corrected route prefix.
- **Shared & Redis Service**: Registered and exported `RedisService` globally in `SharedModule` to make it accessible to all importing modules.
- **Shared Exceptions**: Added `KycLimitExceededException` (HTTP 403) to represent users exceeding their monthly tier-based transfer limits.
- **Transfer Engine Integration**: Wired the `InitiateTransferUseCase` to validate the user's `kycStatus` and calculate monthly transfer limits, enforcing them based on the user's `kycTier`.
- **Idempotency & Interceptor Tests**: Patched `IdempotencyInterceptor` to resolve async race conditions by replacing the unawaited `tap` operator with `mergeMap` and `from`. Fixed the idempotency test suite.

### July 08, 2026
- **API Layer:** Successfully registered and exposed endpoints via `TransferController`, `RatesController`, and `WebhookController`.
- **Exception Handling:** Built and globally bound `FactoPayExceptionFilter` to format domain exceptions consistently.
- **FX Rates Engine:** Integrated `ioredis` to manage caching. Built the `RedisService`, `GetLiveRatesUseCase`, and `LockFxQuoteUseCase` to lock FX quotes with strict 30s expiry. Updated `InitiateTransferUseCase` to enforce quote validation.
- **Shared Kernel & Idempotency:** Implemented the `IdempotencyInterceptor` utilizing `SETNX` atomic locks in Redis. Created the `@RequiresIdempotency()` route decorator and applied it to the `transfers` endpoint to protect against duplicate payment requests.
- **API Gateway Rate Limiting:** Enforced global DDOS & Brute-Force protection by integrating `ThrottlerModule`. Set global API threshold to 120 requests per minute and verified the strict 10 requests per minute limit on sensitive `auth` endpoints.
- **Webhook Integrations & Resilience:** Implemented `WebhookSignatureMiddleware` for strict HMAC verification. Integrated `bullmq` and `@nestjs/bullmq` to queue inbound webhooks to prevent data loss. Configured custom backoff strategy (1m -> 5m -> 15m -> 1h -> DLQ) and exposed the DLQ admin dashboard via `@bull-board`. registered global `SharedModule` to handle database injection across bounded contexts.
- **Shared Kernel Exceptions:** Extended `FactoPayException` hierarchy with auth-related exceptions (`EmailAlreadyExistsException`, `InvalidOtpException`, etc.).
- **Notifications Infrastructure:** Implemented mock SDK adapters for SendGrid (`EmailTransportAdapter`) and Twilio (`SmsTransportAdapter`) to handle OTP verification dispatches.
- **Build Configurations:** Added `nest-cli.json` and `tsconfig.json` to project root and updated `package.json` with NestJS CLI, Passport, Bcrypt, and validation packages.

### July 07, 2026
- **Database & Prisma:** Defined User, UserProfile, AuthSession, and OtpCode models in `prisma/schema.prisma` and resolved the missing database URL config.
- **Shared Kernel Core:** Implemented global `PrismaService` and registered global `SharedModule` to handle database injection across bounded contexts.
- **Shared Kernel Exceptions:** Extended `FactoPayException` hierarchy with auth-related exceptions (`EmailAlreadyExistsException`, `InvalidOtpException`, etc.).
- **Notifications Infrastructure:** Implemented mock SDK adapters for SendGrid (`EmailTransportAdapter`) and Twilio (`SmsTransportAdapter`) to handle OTP verification dispatches.
- **Build Configurations:** Added `nest-cli.json` and `tsconfig.json` to project root and updated `package.json` with NestJS CLI, Passport, Bcrypt, and validation packages.

### July 03, 2026
- **Git Branching:** Switched to the new `dev` branch.
- **Directory Setup:** Created 11 missing specialized DDD folders (e.g., `events`, `gateways`, `services`, `interceptors`, etc.) per architecture specifications.
- **Team Ownership Alignment:** Updated `FactoPay_Backend_Build_Guide.md` and `ARCHITECTURE.md` to replace generic placeholders ("Dev 1", "Dev 2", "Dev 3", "Lead Dev") with actual names (**Christian**, **Oscar**, and **Mr. Samuel**).
- **Ledger Build Guide:** Added `src/modules/wallet-ledger/README.md` outlining specific requirements, db constraints, and test expectations for Mr. Samuel.
- **Auth & Identity:** Completed implementation of the `auth-identity` bounded context, including:
  - Domain Layer: `User` entity, `Role` & `KycStatus` enums, `IUserRepository` contract interface.
  - Application Layer: `RegisterUserUseCase`, `LoginUseCase`, `VerifyOtpUseCase`, `RefreshTokenUseCase` (for token rotation), `GetProfileUseCase`, and `UpdateProfileUseCase` along with respective DTOs.
  - Infrastructure Layer: `AuthController`, `UserController`, `PrismaUserRepository`, and Passport-JWT `JwtStrategy`.
  - Module Wiring: `AuthIdentityModule` definition.
- **KYC Management:** Planning phase started.
