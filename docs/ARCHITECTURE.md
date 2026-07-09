# FactoPay — System Architecture

> **Version:** 1.0 · **Stack:** Flutter · Next.js · NestJS · Stellar · Polygon · USDC  
> **Classification:** CONFIDENTIAL — Internal & Investor Use Only  
> **Last Updated:** July 2026

---

## 1. Executive Summary

FactoPay is a cross-border remittance and payments platform enabling fast, secure, near-zero-fee transfers from Europe and America to Africa. The system is built as a **microservices architecture** using **Domain-Driven Design (DDD)** principles, with blockchain-based settlement via the **Stellar Network** and **USDC stablecoins**.

The backend is a **NestJS monolith organized by bounded contexts** (modular monolith for MVP), designed to evolve into independently deployable microservices as scale demands. All financial logic follows **double-entry accounting** principles with an **append-only immutable ledger**.

---

## 2. High-Level Architecture

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Flutter Mobile  │  │  Next.js Web    │  │  Partner Apps    │
│  (iOS + Android) │  │  (SSR + SPA)    │  │  (Gateway API)  │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
              ┌───────────────▼───────────────┐
              │   API Gateway (Kong / AWS)     │
              │   TLS 1.3 · Rate Limiting      │
              │   HMAC Verification · CORS     │
              └───────────────┬───────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
    ┌────▼────┐         ┌────▼────┐         ┌────▼────┐
    │  Auth   │         │  KYC    │         │ Wallet  │
    │ Service │         │ Service │         │ Service │
    └─────────┘         └─────────┘         └─────────┘
    ┌─────────┐         ┌─────────┐         ┌─────────┐
    │Transfer │         │ Rewards │         │ Notif.  │
    │ Service │         │ Service │         │ Service │
    └─────────┘         └─────────┘         └─────────┘
    ┌─────────┐         ┌─────────┐         ┌─────────┐
    │Gateway  │         │ FX Rate │         │  Admin  │
    │  API    │         │ Service │         │ Service │
    └─────────┘         └─────────┘         └─────────┘
         │                    │                    │
    ┌────▼────────────────────▼────────────────────▼────┐
    │              Data Layer                           │
    │  PostgreSQL (ACID)  ·  Redis (Cache/Sessions)     │
    │  MongoDB (Analytics Logs)                         │
    └──────────────────────┬────────────────────────────┘
                           │
    ┌──────────────────────▼────────────────────────────┐
    │            Blockchain Layer                        │
    │  Stellar (USDC Settlement, 5s finality)           │
    │  Polygon (Smart Contracts, Audit Trail)           │
    │  Fireblocks (MPC Custody, HSM Key Mgmt)           │
    └───────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Mobile** | Flutter | Single codebase for iOS + Android, strong fintech adoption |
| **Web** | Next.js (React) | SSR for SEO, dynamic app routes for dashboard |
| **Backend** | NestJS (TypeScript strict) | Modular DI, maps to DDD bounded contexts, enterprise-grade |
| **ORM** | Prisma (recommended) | Type-safe queries, migrations, MVP speed |
| **Primary DB** | PostgreSQL | ACID compliance — non-negotiable for financial ledger |
| **Cache** | Redis | Idempotency keys, FX quote expiry (30s), sessions, rate limiting |
| **Analytics** | MongoDB | Flexible schema for event logging |
| **Auth** | Passport.js + JWT | Access/refresh token rotation strategy |
| **Validation** | class-validator + Zod | DTO validation at every API boundary |
| **Blockchain** | Stellar Network (primary) | 5s settlement, $0.00001 fee, native USDC |
| **Smart Contracts** | Polygon L2 | EVM compatible, low gas, audit trail |
| **Stablecoin** | USDC (Circle) | Regulated, USD-pegged, widely accepted |
| **Custody** | Fireblocks MPC | Used by 1,800+ institutions, keys never in one location |
| **On-Ramp** | Transak + Circle | 170 countries, SEPA/ACH/card support |
| **Off-Ramp** | Kotani Pay + Flutterwave | Mobile money + bank payout across Africa |
| **Queue** | BullMQ (Redis-backed) | Webhook retries, dead-letter queue |
| **API Docs** | @nestjs/swagger | Auto-generated OpenAPI spec |
| **Testing** | Jest + Supertest | Unit + integration, 90%+ coverage target |
| **Cloud** | AWS / GCP | Africa region coverage, compliance tools |

---

## 4. DDD Bounded Contexts

The backend is organized into **seven bounded contexts**, each encapsulating a distinct business domain. Cross-context communication happens through **domain events** and **public use-case interfaces** — never direct repository access.

### Context Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        SHARED KERNEL                            │
│   Value Objects (Money, CurrencyCode, GuardedUUID)              │
│   Exception Hierarchy (FactoPayException → subclasses)          │
│   IdempotencyMiddleware · RateLimitGuard · RolesGuard           │
└─────────────────────────────────────────────────────────────────┘
        │              │              │              │
   ┌────▼────┐   ┌─────▼─────┐  ┌────▼─────┐  ┌────▼──────────┐
   │  AUTH   │   │    KYC    │  │  WALLET  │  │   TRANSFER    │
   │IDENTITY │   │MANAGEMENT │  │  LEDGER  │  │   ENGINE      │
   │         │   │           │──▶│          │  │               │
   │Register │   │State Mach.│  │Dbl-Entry │◀─│Orchestration  │
   │Login    │   │Doc Upload │  │Balances  │  │FX Quotes      │
   │OTP/JWT  │   │Tiers      │  │Provision │  │Payout Routing │
   └─────────┘   └─────┬─────┘  └──────────┘  └───────┬───────┘
                        │                              │
                  KycApprovedEvent              ┌──────▼───────┐
                                               │  BLOCKCHAIN  │
   ┌─────────────┐   ┌──────────────┐          │  SETTLEMENT  │
   │   AUDIT &   │   │   GATEWAY    │          │              │
   │ COMPLIANCE  │   │ INTEGRATIONS │          │Stellar SDK   │
   │             │   │              │          │Testnet Ops   │
   │Audit Log    │   │Webhook HMAC  │──────────│Tx Confirm    │
   │AML Flags    │   │Retry/DLQ     │          └──────────────┘
   │Interceptor  │   │Flutterwave   │
   └─────────────┘   └──────────────┘
```

### Context Ownership

| Bounded Context | Owner | Key Responsibility |
|---|---|---|
| `shared/` (Kernel) | Christian (Lead) | Value objects, exceptions, idempotency middleware, guards |
| `auth-identity/` | Oscar | Registration, JWT, OTP, refresh token rotation |
| `kyc-management/` | Oscar | KYC state machine, Sumsub integration, tier management |
| `wallet-ledger/` | Mr. Samuel | Double-entry engine, wallet provisioning, balance computation |
| `transfer-engine/` | Christian + Mr. Samuel | FX quotes, transfer orchestration (Christian), ledger posting (Mr. Samuel) |
| `blockchain-settlement/` | Oscar | Stellar SDK wrapper, testnet operations |
| `gateway-integrations/` | Christian | Webhook signature validation, retry/DLQ logic |
| `audit-compliance/` | Oscar | Global audit interceptor, compliance record generation |

### Cross-Context Integration Points

| Event / Call | Producer | Consumer | Contract |
|---|---|---|---|
| `KycApprovedEvent` | KYC Management | Wallet Ledger | `{ userId, timestamp, kycTier }` |
| `PostLedgerTransaction` | Transfer Engine | Wallet Ledger | Use-case call (not direct DB) |
| `CheckKycStatus` | Transfer Engine | KYC Management | Use-case call |
| `SubmitToStellar` | Transfer Engine | Blockchain Settlement | Use-case call |
| `WebhookConfirmed` | Gateway Integrations | Transfer Engine | Domain event |
| `AuditLogInterceptor` | Audit Compliance | All write endpoints | Global NestJS interceptor |

---

## 5. Repository Structure (Clean DDD)

```
src/
├── main.ts                         # Bootstrap, /api/v1/ prefix, global filters
├── app.module.ts                   # Imports all bounded-context modules
│
├── modules/
│   ├── auth-identity/
│   │   ├── domain/
│   │   │   ├── models/             # User, AuthSession
│   │   │   ├── services/           # PasswordHashingService
│   │   │   └── repository-interfaces/
│   │   ├── application/
│   │   │   ├── use-cases/          # RegisterUser, Login, VerifyOtp
│   │   │   └── dtos/               # RegisterDto, LoginDto
│   │   └── infrastructure/
│   │       ├── controllers/        # AuthController
│   │       ├── persistence/        # UserRepository (Prisma)
│   │       └── adapters/           # OtpAdapter, JwtAdapter
│   │
│   ├── kyc-management/
│   │   ├── domain/
│   │   │   ├── models/             # KycRecord (state machine)
│   │   │   ├── events/             # KycApprovedEvent
│   │   │   └── repository-interfaces/
│   │   ├── application/
│   │   │   └── use-cases/          # SubmitKyc, ReviewKyc, ApproveKyc
│   │   └── infrastructure/
│   │       ├── controllers/        # KycController
│   │       └── adapters/           # SumsubAdapter
│   │
│   ├── wallet-ledger/
│   │   ├── domain/
│   │   │   ├── models/             # Wallet, LedgerAccount, LedgerEntry
│   │   │   ├── services/           # DoubleEntryEngine
│   │   │   └── repository-interfaces/
│   │   ├── application/
│   │   │   └── use-cases/          # ProvisionWallet, CalculateBalance, PostLedgerTransaction
│   │   └── infrastructure/
│   │       ├── controllers/        # WalletController
│   │       └── persistence/        # WalletRepository, LedgerRepository
│   │
│   ├── transfer-engine/
│   │   ├── domain/
│   │   │   ├── models/             # Transfer (state machine), FxQuote, Recipient
│   │   │   └── repository-interfaces/
│   │   ├── application/
│   │   │   └── use-cases/          # InitiateTransfer, RequestQuote
│   │   └── infrastructure/
│   │       ├── controllers/        # TransferController, RatesController
│   │       └── persistence/
│   │
│   ├── blockchain-settlement/
│   │   ├── domain/
│   │   │   ├── interfaces/         # IStellarGateway
│   │   │   └── models/             # BlockchainTransaction
│   │   ├── application/
│   │   │   └── use-cases/          # SubmitToStellarTestnet, UpdateStellarTxHash
│   │   └── infrastructure/
│   │       ├── controllers/        # BlockchainController
│   │       └── adapters/           # StellarService (stellar-sdk)
│   │
│   ├── gateway-integrations/
│   │   ├── domain/
│   │   │   └── services/           # WebhookSignatureValidator
│   │   ├── application/
│   │   │   └── use-cases/          # ProcessWebhook
│   │   └── infrastructure/
│   │       ├── controllers/        # WebhookController
│   │       └── queue/              # BullMQ retry + DLQ
│   │
│   ├── audit-compliance/
│   │   ├── domain/
│   │   │   └── models/             # AuditLog, ComplianceRecord
│   │   ├── application/
│   │   │   └── use-cases/          # WriteAuditTrail
│   │   └── infrastructure/
│   │       ├── interceptors/       # AuditLogInterceptor (global)
│   │       └── persistence/
│   │
│   └── shared/
│       ├── domain/
│       │   ├── value-objects/       # Money, CurrencyCode, GuardedUUID
│       │   └── exceptions/         # FactoPayException hierarchy
│       └── infrastructure/
│           ├── database/            # Prisma datasource config
│           ├── idempotency/         # Global IdempotencyMiddleware
│           └── guards/              # RateLimiting, RolesGuard
```

**Isolation Rule:** Each bounded context follows `domain/ → application/ → infrastructure/` layering. Dependencies flow **inward only** — infrastructure depends on application, application depends on domain. Domain has zero external dependencies. Cross-context calls go through the owning module's public use-case — never a reached-in repository.

---

## 6. Blockchain Settlement Architecture

### 6.1 Stellar Wallet Hierarchy

```
FactoPay Master Wallet (Stellar)
│
├── User Custodial Wallets (1 per KYC-verified user)
│   └── Funded with USDC from on-ramp providers
│
├── Liquidity Pool Wallet
│   └── Buffer for instant payouts during high volume
│
├── Fee Collection Wallet
│   └── FactoPay revenue (FX spread + flat fee)
│
└── Partner Anchor Wallets
    ├── Nigeria   — Flutterwave Stellar  → NGN (Bank, OPay, PalmPay)
    ├── Ghana     — Kotani Pay           → GHS (MTN MoMo, Vodafone Cash)
    ├── Kenya     — Kotani Pay / Cowrie   → KES (M-Pesa, Airtel Money)
    ├── S. Africa — VALR / Luno           → ZAR (Bank EFT)
    ├── Tanzania  — Kotani Pay            → TZS (M-Pesa TZ, Tigo Pesa)
    ├── Uganda    — Onafriq / MFS Africa  → UGX (MTN MoMo)
    ├── Senegal   — Wave                  → XOF (Wave Mobile Money)
    └── Ethiopia  — Telebirr / CBE Birr   → ETB (Telebirr)
```

### 6.2 End-to-End Transfer Flow

```
User (Germany)                    FactoPay System                    Recipient (Lagos)
     │                                │                                    │
     │  1. Open app, enter €200       │                                    │
     │  ────────────────────────▶     │                                    │
     │                                │  2. Lock FX quote (30s expiry)     │
     │                                │  3. Check KYC = APPROVED           │
     │                                │  4. Validate wallet balance        │
     │                                │                                    │
     │                                │  5. SEPA/Card → Transak/Circle     │
     │                                │     EUR → USDC (~3s)               │
     │                                │                                    │
     │                                │  6. Post double-entry ledger:      │
     │                                │     USER_WALLET(EUR)    -€200      │
     │                                │     SETTLEMENT(EUR)     +€200      │
     │                                │     SETTLEMENT(EUR)     -€2        │
     │                                │     FEE_ACCOUNT(EUR)    +€2        │
     │                                │                                    │
     │                                │  7. Stellar: USDC → Nigeria        │
     │                                │     Anchor wallet (~5s)            │
     │                                │                                    │
     │                                │  8. Polygon: Record audit hash     │
     │                                │                                    │
     │                                │  9. Flutterwave: USDC → NGN       │
     │                                │     ──────────────────────────▶    │
     │                                │                                    │
     │  10. Push notification          │                 10. NGN deposited  │
     │  ◀────────────────────────     │                 to bank/MoMo       │
     │  11. Reward points credited    │                                    │
     │                                │  12. Audit log written             │
     │                                │                                    │
     Total Time: 60–90 seconds (vs. 1–5 days via SWIFT)
```

### 6.3 Blockchain vs. Traditional Rails Comparison

| Metric | Traditional Rails | FactoPay Blockchain |
|---|---|---|
| Settlement Time | 1–5 business days | 5–90 seconds |
| Cost per Transaction | $8–$15 | $0.01–$0.50 |
| FX Spread | 2–4% | 0.5–1.5% |
| Failed Transactions | ~3% | ~0.1% |
| Corridor Availability | Banking hours only | 24/7/365 |
| Auditability | Internal ledger only | Public blockchain + internal |

### 6.4 Blockchain Security Model

| Layer | Implementation |
|---|---|
| **Multi-Sig Wallets** | All hot wallets require 2-of-3 key signing |
| **MPC Custody** | Fireblocks — private keys never exist in a single location |
| **HSM** | AWS CloudHSM for key derivation and storage |
| **Cold/Hot Ratio** | 85% cold storage / 15% hot wallet for daily liquidity |
| **Smart Contract Audits** | Mandatory audit (Certik/OpenZeppelin) before mainnet |
| **Blockchain AML** | All addresses screened via Chainalysis against OFAC/sanctions |
| **Crypto Insurance** | Custody insurance via Evertas or Lloyd's of London |
| **Proof of Reserves** | Monthly on-chain attestation published publicly |

---

## 7. State Machines

### 7.1 KYC State Machine

```
                    ┌──────────┐
  User registers ──▶│UNVERIFIED│
                    └────┬─────┘
                         │ Submit KYC docs
                    ┌────▼─────┐
              ┌────▶│ PENDING  │◀───────────────┐
              │     └────┬─────┘                │
              │          │ Admin picks up        │ User resubmits
              │     ┌────▼────────┐             │
              │     │UNDER_REVIEW │             │
              │     └──┬──────┬───┘             │
              │        │      │                 │
              │ Approve │      │ Reject          │
              │   ┌────▼──┐ ┌─▼──────┐         │
              │   │APPROVED│ │REJECTED│─────────┘
              │   └───┬────┘ └────────┘
              │       │
              │       ▼ Fires KycApprovedEvent
              │       → Wallet auto-provisioned
```

**Rules:**
- Transitions are **domain methods** on the `KycRecord` model (e.g., `kycRecord.approve()`)
- Never set the status field directly from a controller or service
- Illegal transitions (e.g., `APPROVED → PENDING`) **must throw**

### 7.2 Transfer State Machine

```
CREATED ──▶ PENDING_KYC ──▶ COMPLIANCE_REVIEW ──▶ FX_LOCKED
                                                      │
                                                      ▼
COMPLETED ◀── PAYOUT_PENDING ◀── BLOCKCHAIN_CONFIRMED ◀── WALLET_DEBITED

Any state (except COMPLETED) can transition to FAILED
```

**States:** `CREATED → PENDING_KYC → COMPLIANCE_REVIEW → FX_LOCKED → WALLET_DEBITED → BLOCKCHAIN_CONFIRMED → PAYOUT_PENDING → COMPLETED`

**Critical Rule:** When something goes wrong, prefer `FAILED` over uncertainty. Never mark a transfer `COMPLETED` speculatively. Every transition is logged to `transfer_events` for full audit trail reconstruction.

---

## 8. Core Financial Guardrails

### 8.1 Double-Entry Ledger

- Every transaction produces at least one debit and one credit that **sum to zero**
- `ledger_entries` table is **INSERT-only** — no `UPDATE` or `DELETE` ever
- Reversals are **new compensating entries**, never edits to history
- Wallet balance = `SUM(credits) - SUM(debits)`, computed on read

**Worked Example — €200 Transfer with 1% FX Spread:**

| # | Account Debited | Account Credited | Amount |
|---|---|---|---|
| 1 | USER_WALLET (EUR) | SETTLEMENT_ACCOUNT (EUR) | €200.00 |
| 2 | SETTLEMENT_ACCOUNT (EUR) | FEE_ACCOUNT (EUR) | €2.00 |
| 3 | RESERVE_ACCOUNT (USDC) | SETTLEMENT_ACCOUNT (USDC) | $213.84 |
| 4 | PAYOUT_ACCOUNT (NGN float) | RESERVE_ACCOUNT (USDC) | ₦ equivalent |

### 8.2 Transaction Locking (Prevents double-spend)

Every read-then-write on a wallet uses `SELECT ... FOR UPDATE` inside a single DB transaction. Two concurrent debits against the same wallet cannot both succeed if it would overdraw. In Prisma/TypeORM, wrap the read-check-write sequence in `$transaction`/`queryRunner.startTransaction()`.

### 8.3 Idempotency (Prevents duplicate charges)

All transfer-initiating endpoints require an `Idempotency-Key` header. The middleware checks Redis/Postgres for the key before the request reaches the controller. Duplicate keys return the stored response without re-executing.

### 8.4 Webhook Integrity (Prevents fake payment confirmations)

Every inbound webhook has its **HMAC signature verified** before any business logic runs. Unsigned or mismatched signatures are rejected and logged — full stop. Retry schedule: `1 min → 5 min → 15 min → 1 hour → DLQ` after 5 failures.

---

## 9. API Contract Overview

All endpoints versioned under `/api/v1/`. Transfer endpoints require `Idempotency-Key`.

| Method | Endpoint | Purpose | Owner |
|---|---|---|---|
| POST | `/auth/register` | User registration | Oscar |
| POST | `/auth/login` | JWT issuance | Oscar |
| POST | `/auth/refresh` | Refresh expired JWT | Oscar |
| POST | `/auth/verify-otp` | Phone/email OTP verification | Oscar |
| GET/PATCH | `/users/profile` | Read/update user profile + tier | Oscar |
| POST | `/kyc/submit` | Submit KYC documents | Oscar |
| GET | `/kyc/status` | Check KYC verification state | Oscar |
| PATCH | `/admin/kyc/:id/review` | Admin approve/reject KYC | Oscar |
| POST | `/wallets/create` | Create wallet (auto via KYC event) | Mr. Samuel |
| GET | `/wallets/balance` | Derived multi-currency balance | Mr. Samuel |
| GET | `/wallets/ledger` | Ledger entries for a wallet | Mr. Samuel |
| GET | `/rates/live` | Live FX exchange rates | Christian |
| POST | `/rates/quote` | Lock a quote for 30 seconds | Christian |
| POST | `/transfers/initiate` | Start transfer (**Idempotency-Key**) | Christian |
| GET | `/transfers/:id/status` | Poll transfer status | Christian |
| POST | `/blockchain/send` | Push USDC to anchor (testnet) | Oscar |
| GET | `/blockchain/transactions/:id` | Retrieve blockchain tx details | Oscar |
| POST | `/webhook/flutterwave` | Signed payout confirmation | Christian |
| POST | `/webhook/transak` | Signed on-ramp confirmation | Christian |
| GET | `/rewards/points` | User points balance + history | Christian |
| POST | `/rewards/redeem` | Redeem points for rewards | Christian |
| POST | `/gateway/charge` | B2B partner payment charge | Christian |
| GET | `/admin/dashboard` | Volume, fees, alerts | Christian/Oscar |
| GET | `/admin/transfers` | Search transfers | Christian/Oscar |
| GET | `/admin/audit` | Immutable audit log | Christian/Oscar |

**Canonical Error Codes:** `INSUFFICIENT_BALANCE` · `KYC_NOT_APPROVED` · `FX_QUOTE_EXPIRED` · `TRANSFER_NOT_FOUND` · `BLOCKCHAIN_FAILED` · `COMPLIANCE_FLAGGED` · `RATE_LIMIT_EXCEEDED`

---

## 10. Security Architecture

| Layer | Implementation |
|---|---|
| **Data in Transit** | TLS 1.3, HSTS enforced |
| **Data at Rest** | AES-256 encryption for all PII and financial data |
| **Authentication** | JWT + refresh token rotation, biometric + PIN 2FA |
| **API Protection** | Rate limiting (100 req/min), DDoS via CloudFlare |
| **Fraud Detection** | ML-based anomaly detection, Sardine.ai scoring |
| **Session Security** | IP binding, device fingerprinting, suspicious login alerts |
| **Gateway Security** | IP whitelisting + HMAC signature for partner API calls |
| **Pen Testing** | Quarterly third-party tests + bug bounty program |
| **Compliance Certs** | SOC 2 Type II roadmap, ISO 27001 Year 2 target |

---

## 11. Compliance & Regulatory

| Requirement | Tool / Provider | Priority |
|---|---|---|
| VASP Registration | FCA / FINTRAC / FATF regulators | Critical |
| Travel Rule | Notabene or Sygna Bridge | Critical |
| KYC / Identity | Sumsub or Onfido SDK | Critical |
| AML Monitoring | Sardine.ai or ComplyAdvantage | Critical |
| Blockchain Screening | Chainalysis or Elliptic | Critical |
| GDPR | Internal DPO + privacy-by-design | High |
| PCI-DSS | QSA engagement | High |
| SOC 2 Type II | Vanta or Drata | Medium |
| ISO 27001 | Year 2 target | Medium |

---

## 12. Cross-Cutting Concerns

| Concern | Implementation |
|---|---|
| **Logging** | Structured JSON logs, correlation IDs per request |
| **Monitoring** | Prometheus + Grafana, alerts on failed transfers |
| **Audit Trail** | Global `AuditLogInterceptor` captures every state-modifying request |
| **Error Handling** | `FactoPayException` hierarchy with canonical error codes |
| **Money Handling** | `DECIMAL(18,4)` in Postgres, `decimal.js` in code — never native floats |
| **Timestamps** | All stored and compared in UTC |
| **API Versioning** | All APIs under `/api/v1/`, semver for releases |

---

*© 2025 FactoPay. All Rights Reserved. CONFIDENTIAL.*
