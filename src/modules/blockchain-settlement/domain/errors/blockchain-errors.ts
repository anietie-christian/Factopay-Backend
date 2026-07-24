// ---------------------------------------------------------------------------------------------------------------#*eddiere
/**
 * Blockchain Settlement Error Taxonomy
 *
 * Structured error codes for all blockchain operations.
 * Admin dashboards, retry logic, and alerting key off the `code` field.
 */

export enum BlockchainErrorCode {
  // Stellar transaction errors
  INSUFFICIENT_XLM_RESERVE = 'INSUFFICIENT_XLM_RESERVE',
  DESTINATION_NO_TRUSTLINE = 'DESTINATION_NO_TRUSTLINE',
  TX_TIMEOUT = 'TX_TIMEOUT',
  TX_BAD_SEQUENCE = 'TX_BAD_SEQUENCE',
  TX_FAILED = 'TX_FAILED',
  HORIZON_UNREACHABLE = 'HORIZON_UNREACHABLE',
  INSUFFICIENT_USDC_BALANCE = 'INSUFFICIENT_USDC_BALANCE',
  INVALID_DESTINATION = 'INVALID_DESTINATION',
  MEMO_REQUIRED = 'MEMO_REQUIRED',

  // Security control errors
  DESTINATION_NOT_ALLOWLISTED = 'DESTINATION_NOT_ALLOWLISTED',
  AMOUNT_EXCEEDS_LIMIT = 'AMOUNT_EXCEEDS_LIMIT',
  DAILY_OUTFLOW_EXCEEDED = 'DAILY_OUTFLOW_EXCEEDED',
  MINT_DISABLED_MAINNET = 'MINT_DISABLED_MAINNET',
  XLM_RESERVE_CRITICAL = 'XLM_RESERVE_CRITICAL',
}

export class BlockchainSettlementException extends Error {
  constructor(
    public readonly code: BlockchainErrorCode,
    message: string,
    public readonly stellarDetail?: any,
  ) {
    super(message);
    this.name = 'BlockchainSettlementException';
  }
}
