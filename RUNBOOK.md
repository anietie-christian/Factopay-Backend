
## System Wallet Balances (FX & Liquidity)
System wallets (e.g. `LIQUIDITY` and `SYSTEM` wallet types) are exempt from strict balance checks during cross-currency transfers, allowing them to carry negative balances representing the platform's float. 
**CRITICAL:** There is a hard safety floor set at -1,000,000 to prevent infinite unmonitored drift. This balance must be monitored, and liquidity must be re-injected if the balance approaches this floor to prevent legitimate cross-currency transfers from failing.

## Future Improvements (TODO)
- **Configurable System Float Floor:** Make the `-1,000,000` system wallet balance floor configurable via environment variables before real volume hits.
- **Client-Side Retries:** Consider implementing client-side retry logic for legitimate transfers that fail due to Postgres `lock_timeout` (error code `55P03`) under extreme concurrent load.
