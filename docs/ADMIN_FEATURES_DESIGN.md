# FactoPay — Admin Panel Backend Specifications (v2)

**Status**: DRAFT — Pending Team Review & Approval  
**Last Updated**: July 09, 2026

This document defines the complete set of admin capabilities required to operate, monitor, and regulate a production-grade cross-border remittance platform.

---

## 1. Security & Authorization

### 1.1 Role Hierarchy
Roles are stored on the `User` model (`role` column):

| Role | Scope | Examples |
|---|---|---|
| `USER` | Standard customer | Send transfers, upload KYC, fund wallets |
| `SUPPORT` | Read-only admin access + KYC queue | View users, view transactions, approve/reject KYC |
| `ADMIN` | Full operational control | Everything SUPPORT can do + suspend users, manage transfers, configure fees |
| `SUPERADMIN` | System-level control | Everything ADMIN can do + manage admin roles, system wallets, feature flags, audit log access |

### 1.2 Guard Stack
All `/api/v1/admin/*` endpoints are protected by:
1. `JwtAuthGuard` — Authenticates the request.
2. `RolesGuard` — Checks `req.user.role` against the `@Roles()` decorator on each endpoint.

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERADMIN')
@Controller('api/v1/admin')
export class AdminController {}
```

### 1.3 Admin Audit Trail
Every admin action (approve KYC, suspend user, override transfer, etc.) is logged to an `AdminAuditLog` table for compliance:

```
AdminAuditLog:
  id            UUID PK
  admin_id      UUID FK -> users.id
  action        VARCHAR(50)   // "KYC_APPROVED", "USER_SUSPENDED", "TRANSFER_REFUNDED"
  target_type   VARCHAR(30)   // "USER", "TRANSFER", "WALLET"
  target_id     UUID
  metadata      JSONB         // { reason, previousValue, newValue }
  ip_address    VARCHAR(45)
  created_at    TIMESTAMPTZ
```

This ensures every privileged operation has an immutable paper trail for regulatory audits.

---

## 2. Dashboard Overview

### GET /api/v1/admin/dashboard/overview
**Role**: SUPPORT, ADMIN, SUPERADMIN

Provides the consolidated statistics for the main admin dashboard screen.

#### Response Payload:
```json
{
  "stats": {
    "platformRevenue": 18420.00,
    "platformLiquidity": 540000.00,
    "pendingKyc": 24,
    "totalUsers": 1284,
    "activeTransfers": 12,
    "failedTransfers24h": 3
  },
  "weeklyRevenue": [
    { "day": "Mon", "revenue": 450 },
    { "day": "Tue", "revenue": 680 },
    { "day": "Wed", "revenue": 520 },
    { "day": "Thu", "revenue": 710 },
    { "day": "Fri", "revenue": 890 },
    { "day": "Sat", "revenue": 950 },
    { "day": "Sun", "revenue": 1120 }
  ],
  "recentActivity": [
    {
      "id": "uuid",
      "type": "KYC_APPROVED",
      "description": "KYC Approved for Grace Mensah",
      "timestamp": "2026-07-09T14:28:00Z"
    }
  ]
}
```

#### Aggregation Sources:
| Stat | Source |
|---|---|
| Platform Revenue | Sum of CREDIT entries on FEE wallet accounts |
| Platform Liquidity | Net balance (CREDIT - DEBIT) across LIQUIDITY, SETTLEMENT, RESERVE wallets |
| Pending KYC | `User.count({ kycStatus: 'PENDING' })` |
| Total Users | `User.count({ role: 'USER' })` |
| Active Transfers | `Transfer.count({ status: { in: ['CREATED','FX_LOCKED','WALLET_DEBITED','BLOCKCHAIN_PENDING'] } })` |
| Failed Transfers 24h | `Transfer.count({ status: 'FAILED', updatedAt: { gte: 24hAgo } })` |

---

## 3. KYC Queue Management

### 3.1 GET /api/v1/admin/kyc/queue
**Role**: SUPPORT, ADMIN, SUPERADMIN

Returns a filtered, paginated list of users for manual KYC processing.

#### Query Parameters:
| Param | Type | Description |
|---|---|---|
| `search` | String | Search by name or email |
| `status` | Enum | `PENDING`, `APPROVED`, `REJECTED`, `UNVERIFIED` |
| `country` | String | Country code (e.g. `GH`, `NG`, `KE`) |
| `startDate` | ISO Date | Filter submissions from this date |
| `endDate` | ISO Date | Filter submissions up to this date |
| `page` | Number | Page number (default: 1) |
| `limit` | Number | Items per page (default: 20) |

### 3.2 GET /api/v1/admin/kyc/:userId/details
**Role**: SUPPORT, ADMIN, SUPERADMIN

Returns the full KYC profile for a single user including:
* User profile (name, DOB, nationality, address)
* All uploaded KYC documents with presigned download URLs
* Full verification attempt history (provider, status, timestamps, rejection reasons)

### 3.3 POST /api/v1/admin/kyc/:userId/approve
**Role**: ADMIN, SUPERADMIN

Manually approves a user's KYC verification.

**Business Logic**:
1. Update User: `kycStatus = "APPROVED"`, `kycTier = "TIER_1"`.
2. Create `KycVerificationAttempt`: provider `ADMIN_MANUAL`, status `APPROVED`.
3. Log to `AdminAuditLog`.
4. Send approval notification to user (email + in-app).

### 3.4 POST /api/v1/admin/kyc/:userId/reject
**Role**: ADMIN, SUPERADMIN

Rejects a user's KYC verification with a mandatory reason.

**Request Body**:
```json
{ "reason": "Government ID is expired. Please resubmit a valid document." }
```

**Business Logic**:
1. Update User: `kycStatus = "REJECTED"`, `kycTier = "NONE"`.
2. Create `KycVerificationAttempt`: provider `ADMIN_MANUAL`, status `REJECTED`, reason from payload.
3. Log to `AdminAuditLog`.
4. Send rejection notification with reason to user.

### 3.5 POST /api/v1/admin/kyc/:userId/request-resubmission
**Role**: ADMIN, SUPERADMIN

Requests additional documents from the user without fully rejecting them.

**Request Body**:
```json
{ "message": "Please upload a clearer photo of your proof of address." }
```

**Business Logic**:
1. Update User: `kycStatus = "RESUBMISSION_REQUIRED"`.
2. Send notification to user with the admin's message.
3. Log to `AdminAuditLog`.

### 3.6 PATCH /api/v1/admin/kyc/:userId/upgrade-tier
**Role**: SUPERADMIN

Manually upgrades a user's KYC tier to unlock higher transfer limits.

**Request Body**:
```json
{ "newTier": "TIER_2", "reason": "Enhanced due diligence completed" }
```

---

## 4. User Account Management

### 4.1 GET /api/v1/admin/users
**Role**: SUPPORT, ADMIN, SUPERADMIN

Returns a paginated list of all platform users with profile summary.

#### Query Parameters:
| Param | Type | Description |
|---|---|---|
| `search` | String | Search by name, email, or phone |
| `role` | Enum | Filter by `USER`, `SUPPORT`, `ADMIN` |
| `kycStatus` | Enum | Filter by KYC status |
| `isActive` | Boolean | Filter active/suspended accounts |
| `sortBy` | String | `createdAt`, `lastLoginAt`, `email` |
| `order` | Enum | `asc` or `desc` |
| `page` / `limit` | Number | Pagination |

### 4.2 GET /api/v1/admin/users/:userId
**Role**: SUPPORT, ADMIN, SUPERADMIN

Returns the complete profile of a single user including:
* Personal info (name, email, phone, DOB, nationality)
* KYC status, tier, and verification history
* Wallet balances (derived from ledger)
* Recent transfer history (last 10)
* Active sessions (device, IP, last active)
* Account flags (suspended, MFA enabled)

### 4.3 POST /api/v1/admin/users/:userId/suspend
**Role**: ADMIN, SUPERADMIN

Immediately locks the user's account.
* Sets `isActive = false` on the User model.
* Revokes all active `AuthSession` rows (`isRevoked = true`), forcing logout on all devices.
* Logs to `AdminAuditLog`.

**Request Body**:
```json
{ "reason": "Suspicious transaction patterns detected" }
```

### 4.4 POST /api/v1/admin/users/:userId/unsuspend
**Role**: ADMIN, SUPERADMIN

Restores account access.
* Sets `isActive = true` on the User model.
* Logs to `AdminAuditLog`.

### 4.5 PATCH /api/v1/admin/users/:userId/role
**Role**: SUPERADMIN only

Updates a user's system role. Used to promote users to SUPPORT or ADMIN.

**Request Body**:
```json
{ "role": "ADMIN" }
```

**Validation**: Cannot demote yourself. Cannot assign SUPERADMIN role (must be done via DB seed).

---

## 5. Transaction & Transfer Management

### 5.1 GET /api/v1/admin/transfers
**Role**: SUPPORT, ADMIN, SUPERADMIN

Returns a paginated, filterable list of all transfers on the platform.

#### Query Parameters:
| Param | Type | Description |
|---|---|---|
| `userId` | UUID | Filter transfers for a specific user |
| `status` | Enum | `CREATED`, `FX_LOCKED`, `WALLET_DEBITED`, `BLOCKCHAIN_PENDING`, `COMPLETED`, `FAILED` |
| `currency` | String | Filter by source currency |
| `minAmount` / `maxAmount` | Decimal | Filter by transfer amount range |
| `startDate` / `endDate` | ISO Date | Filter by creation date |
| `page` / `limit` | Number | Pagination |

### 5.2 GET /api/v1/admin/transfers/:transferId
**Role**: SUPPORT, ADMIN, SUPERADMIN

Returns complete transfer details including:
* Transfer metadata (amount, currency, status, timestamps)
* Associated user profile
* Ledger entries (debit/credit trail)
* Blockchain transaction hash (if settlement reached Stellar)
* FX rate that was locked and the spread captured

### 5.3 POST /api/v1/admin/transfers/:transferId/retry
**Role**: ADMIN, SUPERADMIN

Retries a FAILED transfer by re-queuing it to the BullMQ settlement job.

**Validation**: Only transfers in `FAILED` status can be retried.

### 5.4 POST /api/v1/admin/transfers/:transferId/refund
**Role**: SUPERADMIN only

Initiates a full refund for a failed or disputed transfer.

**Business Logic**:
1. Verify transfer is in `FAILED` or `COMPLETED` status.
2. Create reverse ledger entries (CREDIT user wallet, DEBIT settlement wallet).
3. Update transfer status to `REFUNDED`.
4. Log to `AdminAuditLog`.
5. Notify user of refund.

**Request Body**:
```json
{ "reason": "Customer dispute — funds not received by beneficiary" }
```

### 5.5 POST /api/v1/admin/transfers/:transferId/cancel
**Role**: ADMIN, SUPERADMIN

Cancels a transfer that has not yet reached blockchain settlement.

**Validation**: Only transfers in `CREATED`, `FX_LOCKED`, or `WALLET_DEBITED` status can be cancelled.

---

## 6. Wallet & Ledger Operations

### 6.1 GET /api/v1/admin/wallets/system
**Role**: ADMIN, SUPERADMIN

Returns all system wallets (FEE, SETTLEMENT, RESERVE, LIQUIDITY, PAYOUT) with their derived balances.

### 6.2 GET /api/v1/admin/wallets/:walletId/ledger
**Role**: ADMIN, SUPERADMIN

Returns paginated ledger entries for a specific wallet. Supports date range filtering.

### 6.3 POST /api/v1/admin/wallets/fund
**Role**: SUPERADMIN only

Manually funds a system wallet (e.g., adding liquidity to the LIQUIDITY or PAYOUT wallet after a bank deposit).

**Request Body**:
```json
{
  "walletType": "LIQUIDITY",
  "currency": "EUR",
  "amount": 50000.00,
  "reference": "Wire transfer from GTBank - Ref: FP-2026-07-001"
}
```

**Business Logic**:
1. Locate the target system wallet.
2. Create CREDIT ledger entry on the wallet's asset account.
3. Log to `AdminAuditLog`.

### 6.4 POST /api/v1/admin/wallets/defund
**Role**: SUPERADMIN only

Withdraws funds from a system wallet (e.g., profit withdrawal from the FEE wallet).

### 6.5 GET /api/v1/admin/reconciliation
**Role**: SUPERADMIN only

Runs a reconciliation check across all system wallets. Returns:
* Expected vs actual balances
* Any imbalances in the double-entry ledger (total DEBITS should equal total CREDITS globally)
* Flagged orphaned entries

---

## 7. FX Rate & Fee Configuration

### 7.1 GET /api/v1/admin/config/fx-spreads
**Role**: ADMIN, SUPERADMIN

Returns the current FX spread/markup configuration per corridor.

### 7.2 PATCH /api/v1/admin/config/fx-spreads
**Role**: SUPERADMIN only

Updates the FX markup percentage for a specific currency corridor.

**Request Body**:
```json
{
  "corridor": "EUR_NGN",
  "spreadPercent": 1.5,
  "reason": "Adjusted to match market volatility"
}
```

### 7.3 GET /api/v1/admin/config/transfer-limits
**Role**: ADMIN, SUPERADMIN

Returns the current transfer limit configuration per KYC tier.

### 7.4 PATCH /api/v1/admin/config/transfer-limits
**Role**: SUPERADMIN only

Updates the monthly transfer limits per KYC tier.

**Request Body**:
```json
{
  "tier": "TIER_1",
  "dailyLimit": 500.00,
  "monthlyLimit": 2000.00,
  "perTransactionLimit": 500.00,
  "currency": "EUR"
}
```

### 7.5 GET /api/v1/admin/config/fee-structure
**Role**: ADMIN, SUPERADMIN

Returns fee configuration (flat fee + percentage) per corridor.

### 7.6 PATCH /api/v1/admin/config/fee-structure
**Role**: SUPERADMIN only

Updates the fee structure for a specific corridor.

**Request Body**:
```json
{
  "corridor": "EUR_GHS",
  "flatFee": 0.99,
  "percentageFee": 0.5,
  "currency": "EUR"
}
```

---

## 8. Compliance & AML

### 8.1 GET /api/v1/admin/compliance/flagged-users
**Role**: ADMIN, SUPERADMIN

Returns users flagged for suspicious activity based on automated rules:
* Multiple failed transfers in a short window
* Transfer amounts consistently near the KYC tier limit
* Rapid account creation and immediate high-value transfers
* Multiple accounts sharing the same device fingerprint or IP

### 8.2 POST /api/v1/admin/compliance/flag-user
**Role**: ADMIN, SUPERADMIN

Manually flags a user for AML review.

**Request Body**:
```json
{
  "userId": "uuid",
  "reason": "Structuring — multiple transfers just below TIER_1 limit",
  "severity": "HIGH"
}
```

### 8.3 GET /api/v1/admin/compliance/reports/export
**Role**: SUPERADMIN only

Generates a downloadable CSV/XLSX compliance report for a date range. Includes:
* All transfers with sender/receiver details
* KYC approval/rejection history
* Flagged accounts and resolution status

Required for regulatory submissions (e.g., Central Bank reporting, AML audits).

---

## 9. Notification Management

### 9.1 POST /api/v1/admin/notifications/broadcast
**Role**: ADMIN, SUPERADMIN

Sends a system-wide announcement to all users (e.g., scheduled maintenance, new corridor launch).

**Request Body**:
```json
{
  "title": "Scheduled Maintenance",
  "message": "FactoPay will be undergoing maintenance on July 15, 2026 from 02:00-04:00 UTC.",
  "channels": ["IN_APP", "EMAIL"]
}
```

### 9.2 POST /api/v1/admin/notifications/send
**Role**: ADMIN, SUPERADMIN

Sends a targeted notification to a specific user.

**Request Body**:
```json
{
  "userId": "uuid",
  "title": "Document Required",
  "message": "Please upload your proof of address to complete verification.",
  "channels": ["EMAIL"]
}
```

---

## 10. System Configuration & Feature Flags

### 10.1 GET /api/v1/admin/system/health
**Role**: SUPPORT, ADMIN, SUPERADMIN

Returns system health status including:
* API uptime
* Database connection status
* Redis connection status
* External service status (Sumsub, Stellar Horizon, payment gateways)

### 10.2 PATCH /api/v1/admin/system/maintenance-mode
**Role**: SUPERADMIN only

Toggles maintenance mode on/off. When enabled:
* All user-facing endpoints return `503 Service Unavailable`.
* Admin endpoints remain accessible.
* A maintenance message is returned to clients.

**Request Body**:
```json
{
  "enabled": true,
  "message": "We are performing scheduled maintenance. Service will resume shortly."
}
```

### 10.3 GET /api/v1/admin/system/feature-flags
**Role**: ADMIN, SUPERADMIN

Returns current feature flag states.

### 10.4 PATCH /api/v1/admin/system/feature-flags
**Role**: SUPERADMIN only

Toggles feature flags (e.g., disable new registrations, disable specific corridors, enable/disable MFA requirement).

**Request Body**:
```json
{
  "flag": "REGISTRATIONS_ENABLED",
  "value": false,
  "reason": "Pausing new signups during beta review"
}
```

---

## 11. Admin Audit Log

### 11.1 GET /api/v1/admin/audit-log
**Role**: SUPERADMIN only

Returns a paginated, searchable history of all admin actions taken on the platform.

#### Query Parameters:
| Param | Type | Description |
|---|---|---|
| `adminId` | UUID | Filter by which admin performed the action |
| `action` | String | Filter by action type (e.g., `KYC_APPROVED`, `USER_SUSPENDED`) |
| `targetType` | String | Filter by target type (`USER`, `TRANSFER`, `WALLET`) |
| `startDate` / `endDate` | ISO Date | Date range |
| `page` / `limit` | Number | Pagination |

This endpoint is critical for internal investigations and regulatory compliance audits.

---

## Endpoint Summary Table

| # | Endpoint | Method | Min Role | Section |
|---|---|---|---|---|
| 1 | `/admin/dashboard/overview` | GET | SUPPORT | Dashboard |
| 2 | `/admin/kyc/queue` | GET | SUPPORT | KYC |
| 3 | `/admin/kyc/:userId/details` | GET | SUPPORT | KYC |
| 4 | `/admin/kyc/:userId/approve` | POST | ADMIN | KYC |
| 5 | `/admin/kyc/:userId/reject` | POST | ADMIN | KYC |
| 6 | `/admin/kyc/:userId/request-resubmission` | POST | ADMIN | KYC |
| 7 | `/admin/kyc/:userId/upgrade-tier` | PATCH | SUPERADMIN | KYC |
| 8 | `/admin/users` | GET | SUPPORT | Users |
| 9 | `/admin/users/:userId` | GET | SUPPORT | Users |
| 10 | `/admin/users/:userId/suspend` | POST | ADMIN | Users |
| 11 | `/admin/users/:userId/unsuspend` | POST | ADMIN | Users |
| 12 | `/admin/users/:userId/role` | PATCH | SUPERADMIN | Users |
| 13 | `/admin/transfers` | GET | SUPPORT | Transfers |
| 14 | `/admin/transfers/:transferId` | GET | SUPPORT | Transfers |
| 15 | `/admin/transfers/:transferId/retry` | POST | ADMIN | Transfers |
| 16 | `/admin/transfers/:transferId/refund` | POST | SUPERADMIN | Transfers |
| 17 | `/admin/transfers/:transferId/cancel` | POST | ADMIN | Transfers |
| 18 | `/admin/wallets/system` | GET | ADMIN | Wallets |
| 19 | `/admin/wallets/:walletId/ledger` | GET | ADMIN | Wallets |
| 20 | `/admin/wallets/fund` | POST | SUPERADMIN | Wallets |
| 21 | `/admin/wallets/defund` | POST | SUPERADMIN | Wallets |
| 22 | `/admin/reconciliation` | GET | SUPERADMIN | Wallets |
| 23 | `/admin/config/fx-spreads` | GET/PATCH | ADMIN/SUPERADMIN | Config |
| 24 | `/admin/config/transfer-limits` | GET/PATCH | ADMIN/SUPERADMIN | Config |
| 25 | `/admin/config/fee-structure` | GET/PATCH | ADMIN/SUPERADMIN | Config |
| 26 | `/admin/compliance/flagged-users` | GET | ADMIN | Compliance |
| 27 | `/admin/compliance/flag-user` | POST | ADMIN | Compliance |
| 28 | `/admin/compliance/reports/export` | GET | SUPERADMIN | Compliance |
| 29 | `/admin/notifications/broadcast` | POST | ADMIN | Notifications |
| 30 | `/admin/notifications/send` | POST | ADMIN | Notifications |
| 31 | `/admin/system/health` | GET | SUPPORT | System |
| 32 | `/admin/system/maintenance-mode` | PATCH | SUPERADMIN | System |
| 33 | `/admin/system/feature-flags` | GET/PATCH | ADMIN/SUPERADMIN | System |
| 34 | `/admin/audit-log` | GET | SUPERADMIN | Audit |
