# Wallet & Ledger Bounded Context — Implementation Guide
**Owner:** Mr. Samuel (Ledger & Wallet Co-Owner)  
**Stack:** TypeScript · NestJS · Prisma/PostgreSQL

---

## 1. Domain Model Overview

This module is the financial heart of FactoPay. Every transaction is represented by immutable, double-entry ledger entries. You are responsible for ensuring that money is never lost, duplicated, or updated directly.

```
                  ┌──────────────────────┐
                  │        Wallet        │
                  │  (Multi-currency)   │
                  └──────────┬───────────┘
                             │ 1
                             │
                             │ *
                  ┌──────────▼───────────┐
                  │    LedgerAccount     │
                  │ (Asset, Liability...)│
                  └──────────┬───────────┘
                             │ 1
                             │
                             │ *
                  ┌──────────▼───────────┐
                  │     LedgerEntry      │
                  │ (DEBIT / CREDIT)     │
                  │  ⚠️ INSERT-ONLY      │
                  └──────────────────────┘
```

---

## 2. Technical Requirements & Rules

1. **Precision Math:** Never use Javascript `number`/`float` for financial math. Use `decimal.js` and map them to Postgres `DECIMAL(18,4)`.
2. **Immutable Entries:** The `ledger_entries` table must be **INSERT-only**. No `UPDATE` or `DELETE` statement is ever allowed against it. Reversals must be executed as new balancing entries.
3. **Derived Balances:** A wallet's balance is **never** a database column. It is always calculated dynamically as:
   $$\text{Balance} = \sum \text{Credits} - \sum \text{Debits}$$
4. **Double Entry Rule:** Every financial event must contain at least one DEBIT and one CREDIT, and their sum must be exactly zero:
   $$\sum \text{Debits} == \sum \text{Credits}$$
5. **Row Locking:** Before posting any transaction that decreases a wallet's balance, you must perform a row-level lock (`SELECT ... FOR UPDATE`) on the `Wallet` row to prevent race conditions.

---

## 3. Database Schema Mapping (Prisma Schema Reference)

Ensure the database schema conforms to this design:

```prisma
enum WalletType {
  USER
  SETTLEMENT
  FEE
  RESERVE
  PAYOUT
  LIQUIDITY
}

enum AccountType {
  ASSET
  LIABILITY
  REVENUE
  EXPENSE
}

enum EntryType {
  DEBIT
  CREDIT
}

model Wallet {
  id                String          @id @default(uuid()) @db.Uuid
  userId            String          @db.Uuid
  currency          String          @db.VarChar(5) // EUR, USD, GBP, USDC, GHS, NGN...
  walletType        WalletType      @default(USER)
  stellarPublicKey  String?         @db.VarChar(56)
  isActive          Boolean         @default(true)
  createdAt         DateTime        @default(now()) @db.Timestamptz
  updatedAt         DateTime        @updatedAt @db.Timestamptz
  accounts          LedgerAccount[]

  @@unique([userId, currency])
  @@map("wallets")
}

model LedgerAccount {
  id          String        @id @default(uuid()) @db.Uuid
  walletId    String        @db.Uuid
  wallet      Wallet        @relation(fields: [walletId], references: [id])
  accountType AccountType
  currency    String        @db.VarChar(5)
  name        String        @db.VarChar(100)
  isActive    Boolean       @default(true)
  createdAt   DateTime      @default(now()) @db.Timestamptz
  entries     LedgerEntry[]

  @@map("ledger_accounts")
}

model LedgerEntry {
  id              String        @id @default(uuid()) @db.Uuid
  transactionId   String        @db.Uuid // Correlates debits and credits of one transfer
  ledgerAccountId String        @db.Uuid
  ledgerAccount   LedgerAccount @relation(fields: [ledgerAccountId], references: [id])
  entryType       EntryType
  amount          Decimal       @db.Decimal(18, 4)
  currency        String        @db.VarChar(5)
  description     String        @db.VarChar(255)
  referenceType   String?       @db.VarChar(30) // TRANSFER, FEE, REVERSAL
  referenceId     String?       @db.Uuid
  createdAt       DateTime      @default(now()) @db.Timestamptz

  @@index([ledgerAccountId, createdAt])
  @@index([transactionId])
  @@map("ledger_entries")
}
```

---

## 4. Coding Structure (Bounded Context)

Please build out the module skeleton in `src/modules/wallet-ledger/` using the following file map:

### 4.1 Domain Services
#### File: `src/modules/wallet-ledger/domain/services/double-entry.engine.ts`
Implement the rule that checks if the proposed entry set balances out.
```typescript
import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { EntryType } from '@prisma/client';

export interface ProposedEntry {
  ledgerAccountId: string;
  entryType: EntryType;
  amount: Decimal;
  currency: string;
}

@Injectable()
export class DoubleEntryEngine {
  validate(entries: ProposedEntry[]): boolean {
    if (!entries || entries.length < 2) return false;
    
    let debits = new Decimal(0);
    let credits = new Decimal(0);
    const baseCurrency = entries[0].currency;

    for (const entry of entries) {
      if (entry.currency !== baseCurrency) {
        throw new Error('Multi-currency entry mismatch within a single transaction ID');
      }
      if (entry.entryType === EntryType.DEBIT) {
        debits = debits.plus(entry.amount);
      } else {
        credits = credits.plus(entry.amount);
      }
    }

    return debits.equals(credits);
  }
}
```

### 4.2 Use Cases
You must implement three primary Use Cases under `src/modules/wallet-ledger/application/use-cases/`:

1. **`ProvisionWalletUseCase`**
   - Triggered by Oscar's `KycApprovedEvent`.
   - Creates a user wallet profile and initializes the standard `LedgerAccount` (e.g., Liability account for user balance).
2. **`CalculateBalanceUseCase`**
   - Queries `ledger_entries` for a `ledgerAccountId`.
   - Returns: $\sum \text{Credits} - \sum \text{Debits}$.
3. **`PostLedgerTransactionUseCase`**
   - Receives an array of proposed ledger entries and a `transactionId`.
   - Locks the affected `Wallet` tables using Prisma query raw locks (`SELECT ... FOR UPDATE`).
   - Runs `DoubleEntryEngine.validate()`.
   - Inserts entries inside a transactional context (`prisma.$transaction`).

### 4.3 API Controller
#### File: `src/modules/wallet-ledger/infrastructure/controllers/wallet.controller.ts`
Expose the endpoints under prefix `/api/v1/wallet/*`:
- `GET /api/v1/wallet/balance` — Returns the derived currency balance for the authenticated user's wallet.
- `GET /api/v1/wallet/ledger` — Returns the transaction lines (ledger entries) for history pagination.

---

## 5. Testing Requirements (Jest)

You are expected to provide 90%+ code coverage. Add your tests under `src/modules/wallet-ledger/__tests__/`:

1. **Double Entry Engine Test:** Verify it throws or returns `false` if debits and credits do not balance.
2. **Derived Balance Test:** Post entries (Credits of 500, Debits of 200) and assert derived balance is exactly 300.0000.
3. **Double Spend Concurrency Test:** Write a test making 5 simultaneous debit requests of 100 against a wallet with a balance of 150. Confirm that exactly one request succeeds and the remaining throw an `InsufficientBalanceException` (ensuring your `SELECT ... FOR UPDATE` row lock works).

---

## 6. Integration points with teammates:
- **Oscar (Auth/KYC)**: Will trigger `KycApprovedEvent`. You must listen to this event (using NestJS `@EventPattern` or `EventEmitter2`) and provision the wallets.
- **Christian (Lead/Transfers)**: His `InitiateTransferUseCase` will invoke your `PostLedgerTransactionUseCase` to move funds out of the user's wallet into settlement accounts.
