# FactoPay Modules — Progress & Change Log

This file tracks the ownership, development status, and recent changes of each bounded context module within `src/modules/`.

## 📋 Module Assignment & Status

| Module | Scope / Bounded Context | Owner | Status |
|---|---|---|---|
| `auth-identity` | User registration, login, OTP, JWT, Passport strategy | **Oscar** | ✅ Completed |
| `kyc-management` | KYC state machine, document uploads, Sumsub mocks | **Oscar** | 🔄 In Progress |
| `blockchain-settlement` | Stellar SDK wrapper, on-chain transactions, testnet ops | **Oscar** | ⏳ Pending |
| `audit-compliance` | Global audit interceptor, compliance checks | **Oscar** | ⏳ Pending |
| `wallet-ledger` | Double-entry engine, wallet provisioning, balance derivation | **Mr. Samuel** | ⏳ Pending |
| `transfer-engine` | FX rate locking, transfer orchestration | **Christian** | ✅ Completed |
| `gateway-integrations` | Webhook verification (Flutterwave, Transak) | **Christian** | ✅ Completed |
| `shared` | Exceptions, value objects, global middleware, guards | **Christian** | ✅ Completed |

---

## 📝 Recent Changes
- **transfer-engine (FX Rates):** Christian implemented the `GetLiveRatesUseCase` and `LockFxQuoteUseCase` which retrieves live rates and caches quotes in Redis for exactly 30 seconds using `ioredis`. Enforced `FxQuoteExpiredException` inside the transfer orchestration to protect against rate slippage.
- **transfer-engine (Orchestration):** Christian implemented the `InitiateTransferUseCase` orchestration logic, successfully incorporating Prisma `$transaction` and raw row-level locking for secure debits.
- **gateway-integrations:** Christian implemented the `WebhookSignatureMiddleware` to strictly verify HMAC SHA-256 signatures for inbound payment webhooks.
- **gateway-integrations (Resilience):** Christian implemented a Webhook Retry System using **BullMQ**. Inbound webhooks are now queued with a strict custom exponential backoff (1m, 5m, 15m, 1h) and dropped into a Dead-Letter Queue (DLQ) after 5 failures. Included `@bull-board/nestjs` for Admin Dashboard UI visibility.
---

## 📢 Integration Requests for Christian (Lead Dev) [COMPLETED]

The integration requests to support the end-to-end integration of the completed `auth-identity` module are now successfully set up in the `shared` module:

1. **`PrismaService`** (✅ Completed):
   - **Path**: `src/modules/shared/infrastructure/database/prisma.service.ts`
   - **Details**: Exposed NestJS client wrapper for Prisma database connection.
2. **`FactoPayException` Hierarchy** (✅ Completed):
   - **Path**: `src/modules/shared/domain/exceptions/`
   - **Details**: Added auth-specific exceptions (`EmailAlreadyExistsException`, `InvalidOtpException`, etc.) mapping to standard API error responses.
3. **SMS & Email Transport Adapters** (✅ Completed):
   - **Path**: `src/modules/shared/infrastructure/notifications/`
   - **Details**: Setup integration adapters for **SendGrid** (Email OTP) and **Twilio** (SMS OTP) to allow OTP code delivery.

---

## 🚀 Change Log

### July 08, 2026
- **API Layer:** Successfully registered and exposed endpoints via `TransferController`, `RatesController`, and `WebhookController`.
- **Exception Handling:** Built and globally bound `FactoPayExceptionFilter` to format domain exceptions consistently.
- **FX Rates Engine:** Integrated `ioredis` to manage caching. Built the `RedisService`, `GetLiveRatesUseCase`, and `LockFxQuoteUseCase` to lock FX quotes with strict 30s expiry. Updated `InitiateTransferUseCase` to enforce quote validation.
- **Webhook Integrations & Resilience:** Implemented `WebhookSignatureMiddleware` for strict HMAC verification. Integrated `bullmq` and `@nestjs/bullmq` to queue inbound webhooks to prevent data loss. Configured custom backoff strategy (1m -> 5m -> 15m -> 1h -> DLQ) and exposed the DLQ admin dashboard via `@bull-board`.

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
