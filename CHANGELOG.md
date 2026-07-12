# Changelog

## [Unreleased]

### Added
- **Multi-Currency Ledger Logic**: Upgraded `DoubleEntryEngine` to group entries by currency and validate `DEBIT = CREDIT` independently for each currency.
- **FX & Liquidity Handling**: Implemented 4-way FX entry routing in `InitiateTransferUseCase`. Cross-currency transfers now correctly hit system FX and Liquidity wallets.
- **Ledger Reversal Mechanism**: Implemented `ReverseLedgerTransactionUseCase` to automatically generate inverted entries upon blockchain settlement failures.
- **Deterministic Reversals**: Used `uuidv5` namespaces to ensure reversal transactions are fully idempotent.

### Changed
- **Concurrency & Idempotency**: Refactored `PostLedgerTransactionUseCase` to rely on strict `SELECT FOR UPDATE` row locks with `lock_timeout`. Replaced optimistic concurrency arrays with deterministic Postgres constraints.
- **System Float Policy**: Allowed system `LIQUIDITY` and `SYSTEM` wallets to go negative (representing float), but implemented a hard `-1,000,000` safety floor.

### Fixed
- **Cross-Currency Validation Bug**: Fixed the fundamental design flaw where the ledger rejected any cross-currency transfers due to mixed-currency balancing.
- **Idempotency Race Condition**: Replaced unsafe `findFirst` and application-level retry loops with atomic database locks and application-level idempotency check via `findFirst` inside the lock scope.
- **Zero-Amount Transfers**: Added explicit validation in the double-entry engine to reject zero or negative amount entries.
