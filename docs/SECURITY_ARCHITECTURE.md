# FactoPay — Backend Security Architecture (2026 Edition)
**Classification:** CONFIDENTIAL · INTERNAL USE ONLY  
**Target:** Production-Grade Fintech & Remittance Rails Security  

---

## 1. Executive Summary

As a cross-border remittance system handling fiat (EUR, NGN, GHS, KES, ZAR) and digital assets (USDC), FactoPay must implement a defense-in-depth security model. This document defines the engineering standards, architectural boundaries, and operational guardrails required to prevent theft, fraud, double-spending, and compliance breaches.

---

## 2. Threat Landscape & Critical Targets

```
  ┌─────────────────────────────────────────────────────────────┐
  │                   ATTACK VECTORS (2026)                     │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
     ┌───────────────────────────┼───────────────────────────┐
     ▼                           ▼                           ▼
[ Ledger Manipulation ]   [ Key Compromise ]     [ API Gateway Bypasses ]
- Unauthorized updates    - Hot wallet leak      - Webhook spoofing
- Balance inflation       - MPC partition leak   - Replay attacks
```

We classify our critical assets under three high-impact security tiers:
1. **Tier 1 (Ultimate Risk):** Hot wallet private keys (Stellar/Polygon), ledger entries database integrity.
2. **Tier 2 (High Risk):** User PII data (KYC documents, phone numbers, emails), JWT signing keys.
3. **Tier 3 (Medium Risk):** Transaction metadata, analytics logs, non-settlement databases.

---

## 3. Data Protection Standards

### 3.1 Encryption in Transit
- **TLS Protocol:** TLS 1.3 only. Fallbacks to TLS 1.2 are disabled at the API Gateway level.
- **HSTS:** Enforced with `max-age=63072000; includeSubDomains; preload`.
- **Cipher Suites:** Strict restriction to modern secure AEAD ciphers (e.g., `TLS_AES_256_GCM_SHA384`).

### 3.2 Encryption at Rest
- **Database Storage:** Database storage volumes encrypted via AWS EBS KMS using customer-managed keys (CMK).
- **Sensitive Fields (PII):** User phone numbers, document IDs, and bank details must be encrypted at the application layer before database insertion using **AES-256-GCM** with unique initialization vectors (IVs).
- **Secrets Management:** Environment secrets (DB passwords, provider keys) must never be committed to git or stored in files. Use AWS Secrets Manager or HashiCorp Vault with dynamic rotation.

---

## 4. Ledger & Financial Integrity (Anti-Double Spend)

### 4.1 Immutable Ledger Invariant
- The database table `ledger_entries` is strictly **write-only**.
- DB-level triggers must block all `UPDATE` and `DELETE` queries on the ledger:
```sql
CREATE RULE protect_ledger_updates AS ON UPDATE TO ledger_entries DO INSTEAD NOTHING;
CREATE RULE protect_ledger_deletes AS ON DELETE TO ledger_entries DO INSTEAD NOTHING;
```

### 4.2 Concurrency & Double Spend Protection
- Any balance debit operation must run inside an isolated ACID database transaction utilizing pessimistic row locks:
  ```typescript
  // Example implementation structure using transaction query
  await prisma.$transaction(async (tx) => {
    // 1. Lock the wallet row to prevent concurrent race conditions
    const wallet = await tx.$queryRaw`SELECT * FROM "Wallet" WHERE id = ${walletId} FOR UPDATE`;
    
    // 2. Validate current balance
    const currentBalance = await calculateBalance(walletId, tx);
    if (currentBalance.lessThan(debitAmount)) throw new InsufficientBalanceException();
    
    // 3. Insert the ledger entries (debit & credit)
    await tx.ledgerEntry.createMany({ data: [...] });
  });
  ```

---

## 5. Authentication & Session Security

```
┌──────────────┐          1. Request Login          ┌──────────────┐
│  Client App  │ ─────────────────────────────────▶ │ Auth Service │
│              │ ◀───────────────────────────────── │              │
└──────────────┘    2. Return Access + Refresh      └──────────────┘
       │                                                   │
       │          3. Route with Access Token               │
       ├───────────────────────────────────────────────────┼──▶ [ Protected Route ]
       │             (Verification: JWT Strategy)          │
       │                                                   │
       │          4. Access Token Expired (15m)            │
       │          5. Call /auth/refresh with Refresh       │
       └───────────────────────────────────────────────────┴──▶ Issues New Pair
```

### 5.1 Token Strategy
- **Access Tokens:** Signed with HMAC-SHA256, expiration set to **15 minutes**.
- **Refresh Tokens:** Expiration set to **7 days**. Issued alongside access tokens.
- **Refresh Token Rotation (RTR):** When a refresh token is used to obtain a new access token, the old refresh token is immediately invalidated, and a new refresh token is returned to the client. If an expired refresh token is reused, all descendants of that token family are revoked (detecting token theft).

### 5.2 Device Fingerprinting & IP Binding
- Auth tokens are bound to a combined hash of the user's `User-Agent` and source `IP Subnet`.
- If the source IP subnet changes significantly or device fingerprints mismatch, the user session is immediately terminated, requiring a re-authentication flow (biometric/PIN/OTP).

---

## 6. API & Network Boundary Security

### 6.1 API Gateway (Kong / AWS API Gateway)
- All traffic passes through the API Gateway. No client communicates directly with microservices.
- **Rate Limiting:** Enforced at the gateway level:
  - Public routes (Register/Login): Max `10 requests/minute` per IP address.
  - Protected routes: Max `120 requests/minute` per user.
- **CORS Config:** Explicitly whitelist origins (`app.factopay.com`). Wildcards (`*`) are disallowed.

### 6.2 Idempotency Middleware
- All state-changing write operations (specifically transfers and payouts) require an `Idempotency-Key` UUID header.
- The middleware locks the key in Redis for 120 seconds. If a duplicate request arrives, it waits for the original request processing to finish or returns the cached response.

### 6.3 Secure HTTP Headers
- The NestJS app must use `helmet` to set secure HTTP headers:
  - `Content-Security-Policy` (strict CSP)
  - `X-Frame-Options: DENY` (prevents clickjacking)
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`

---

## 7. Webhook & Integration Integrity

```
┌──────────────────┐               Signed Webhook               ┌──────────────────┐
│   Flutterwave    │ ─────────────────────────────────────────▶ │   FactoPay API   │
│   / Transak      │                                            │                  │
└──────────────────┘                                            └────────┬─────────┘
                                                                         │
                                                                         ▼
                                                               ┌──────────────────┐
                                                               │  HMAC Validation │
                                                               │  Signature Ok?   │
                                                               └─────────┬────────┘
                                                                         │
                                                       ┌─────────────────┴─────────────────┐
                                                       ▼                                   ▼
                                                   [ Yes ]                               [ No ]
                                            Process Payout/On-Ramp                  Reject & Flag Event
```

To prevent attackers from simulating fake deposits:
1. **HMAC Verification:** Webhook endpoints must verify the payload signature using the provider's shared secret:
   ```typescript
   const hash = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
   if (hash !== receivedSignature) throw new UnauthorizedException('Invalid Signature');
   ```
2. **IP Whitelisting:** Bind webhook controllers to accept traffic only from authorized IP addresses of Flutterwave, Circle, and Transak.
3. **Idempotent Webhook Processing:** Check the webhook transaction ID in the database before completing operations to prevent double-processing.

---

## 8. Blockchain & Custody Security

### 8.1 Custody & Key Management (Fireblocks MPC)
- **Zero Raw Keys:** Private keys are never stored on FactoPay databases, application containers, or server environments.
- **Multi-Party Computation (MPC):** We utilize **Fireblocks** for custody. Key material is divided into multiple shares, distributed across secure enclaves, and signed collaboratively without the full key ever coming together.
- **Hot Wallet Policies:** Define rule engines within Fireblocks:
  - Any transaction exceeding `$10,000 equivalent` requires manual approval from two designated administrators.
  - Payouts are restricted only to whitelisted partner addresses (Kotani Pay, Flutterwave settlement anchors).

### 8.2 Address Screening (AML Compliance)
- Before executing any outbound Stellar USDC transaction, the destination Stellar account must be screened via the **Chainalysis API**.
- Transactions to addresses flagged for sanctions, high-risk mixers, or darknet activity are blocked instantly and logged to compliance alerts.

---

## 9. Security Development Lifecycle (SecDevOps)

1. **Dependency Auditing:** Automatic daily scans via `npm audit` and Github Dependabot. Build pipelines must block commits with high or critical vulnerabilities.
2. **Static Code Analysis (SAST):** Integrate SonarQube or Snyk in the CI pipeline to catch hardcoded secrets, SQL injection flaws, or crypto misuse.
3. **Audit Trail Logging:** All administrative modifications and security state changes (KYC approval/rejections, user deactivations) are logged immutably via `AuditLogInterceptor` to an isolated MongoDB collection.
