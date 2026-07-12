/**
 * Stellar Gateway Interface
 *
 * Defines the contract for all interactions with the Stellar Network.
 * The infrastructure adapter (StellarService) implements this interface
 * and resolves wallet keys internally — use cases never touch raw keys.
 */

export const STELLAR_GATEWAY_TOKEN = Symbol('IStellarGateway');

// ----------------------------------------
// Wallet Role Enum
// ----------------------------------------

export enum StellarWalletRole {
  MASTER = 'MASTER',
  FEE = 'FEE',
  LIQUIDITY = 'LIQUIDITY',
  ISSUER = 'ISSUER', // mock USDC issuer (testnet only)
}

// ----------------------------------------
// Network Mode Enum
// ----------------------------------------

export enum StellarNetworkMode {
  TESTNET = 'TESTNET',
  MAINNET = 'MAINNET',
}

// ----------------------------------------
// Response Types
// ----------------------------------------

export interface StellarTransactionResult {
  txHash: string;
  ledger: number;
  createdAt: string;
  feeCharged: string;
  sourceAccount: string;
  memo?: string;
}

export interface StellarAccountInfo {
  publicKey: string;
  xlmBalance: string;
  usdcBalance: string;
  sequenceNumber: string;
  trustlinesCount: number;
}

export interface StellarTransactionVerification {
  exists: boolean;
  successful: boolean;
  ledger?: number;
  createdAt?: string;
}

// ----------------------------------------
// Gateway Interface
// ----------------------------------------

export interface IStellarGateway {
  // Account Management
  createKeyPair(): { publicKey: string; secretKey: string };
  fundWithFriendbot(publicKey: string): Promise<boolean>;
  getAccountInfo(publicKey: string): Promise<StellarAccountInfo>;

  // Trustline Management
  establishUsdcTrustline(
    walletPublicKey: string,
    walletSecretKey: string,
  ): Promise<string>;

  // Asset Operations (testnet only)
  mintUsdc(
    destinationPublicKey: string,
    amount: string,
  ): Promise<StellarTransactionResult>;

  // Payment Operations
  sendUsdc(params: {
    senderRole: StellarWalletRole;
    destinationPublicKey: string;
    amount: string;
    memo: string;
  }): Promise<StellarTransactionResult>;

  // Verification
  verifyTransaction(txHash: string): Promise<StellarTransactionVerification>;

  // Role resolution
  getPublicKeyForRole(role: StellarWalletRole): string;
}
