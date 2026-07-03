# FactoPay Modules — Progress & Change Log

This file tracks the ownership, development status, and recent changes of each bounded context module within `src/modules/`.

## 📋 Module Assignment & Status

| Module | Scope / Bounded Context | Owner | Status |
|---|---|---|---|
| `auth-identity` | User registration, login, OTP, JWT, Passport strategy | **Oscar** | 🔄 In Progress |
| `kyc-management` | KYC state machine, document uploads, Sumsub mocks | **Oscar** | 🔄 In Progress |
| `blockchain-settlement` | Stellar SDK wrapper, on-chain transactions, testnet ops | **Oscar** | ⏳ Pending |
| `audit-compliance` | Global audit interceptor, compliance checks | **Oscar** | ⏳ Pending |
| `wallet-ledger` | Double-entry engine, wallet provisioning, balance derivation | **Mr. Samuel** | ⏳ Pending |
| `transfer-engine` | FX rate locking, transfer orchestration | **Christian** | ⏳ Pending |
| `gateway-integrations` | Webhook verification (Flutterwave, Transak) | **Christian** | ⏳ Pending |
| `shared` | Exceptions, value objects, global middleware, guards | **Christian** | ⏳ Pending |

---

## 📢 Integration Requests for Christian (Lead Dev)

To complete the end-to-end integration of the completed `auth-identity` module, Oscar requests the following components to be set up in the `shared` module:

1. **`PrismaService`**:
   - **Path**: `src/modules/shared/infrastructure/database/prisma.service.ts`
   - **Details**: Expose a standard NestJS client wrapper for Prisma database connection so the `PrismaUserRepository` can resolve it.
2. **`FactoPayException` Hierarchy**:
   - **Path**: `src/modules/shared/domain/exceptions/`
   - **Details**: Define the base class exceptions so we can map auth errors (like `EmailAlreadyExistsException`, `InvalidOtpException`) to standardized API error response bodies.

---

## 🚀 Change Log

### July 03, 2026
- **Git Branching:** Switched to the new `dev` branch.
- **Directory Setup:** Created 11 missing specialized DDD folders (e.g., `events`, `gateways`, `services`, `interceptors`, etc.) per architecture specifications.
- **Team Ownership Alignment:** Updated `FactoPay_Backend_Build_Guide.md` and `ARCHITECTURE.md` to replace generic placeholders ("Dev 1", "Dev 2", "Dev 3", "Lead Dev") with actual names (**Christian**, **Oscar**, and **Mr. Samuel**).
- **Ledger Build Guide:** Added `src/modules/wallet-ledger/README.md` outlining specific requirements, db constraints, and test expectations for Mr. Samuel.
- **Auth & Identity:** Completed implementation of the `auth-identity` bounded context, including:
  - Domain Layer: `User` entity, `Role` & `KycStatus` enums, `IUserRepository` contract interface.
  - Application Layer: `RegisterUserUseCase`, `LoginUseCase`, `VerifyOtpUseCase`, registration/login/OTP verification DTOs.
  - Infrastructure Layer: `AuthController`, `PrismaUserRepository`, and Passport-JWT `JwtStrategy`.
  - Module Wiring: `AuthIdentityModule` definition.
- **KYC Management:** Planning phase started.
