import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  Networks,
  Horizon,
  TimeoutInfinite,
  Memo,
} from '@stellar/stellar-sdk';
import {
  IStellarGateway,
  StellarWalletRole,
  StellarNetworkMode,
  StellarTransactionResult,
  StellarAccountInfo,
  StellarTransactionVerification,
} from '../../domain/gateways/stellar-gateway.interface';
import {
  BlockchainErrorCode,
  BlockchainSettlementException,
} from '../../domain/errors/blockchain-errors';
import { StellarLogSanitizer } from '../security/stellar-log-sanitizer';
import { WalletLockManager } from '../security/wallet-lock.manager';

@Injectable()
export class StellarService implements IStellarGateway {
  private readonly logger = new Logger(StellarService.name);
  private readonly server: Horizon.Server;
  private readonly networkPassphrase: string;
  private readonly networkMode: StellarNetworkMode;
  private readonly usdcAssetCode = 'USDC';
  private readonly usdcIssuerPublicKey: string;

  private readonly walletKeys = new Map<StellarWalletRole, { publicKey: string; secretKey: string }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly lockManager: WalletLockManager,
  ) {
    const horizonUrl = this.configService.get<string>(
      'STELLAR_HORIZON_URL',
      'https://horizon-testnet.stellar.org',
    );
    this.server = new Horizon.Server(horizonUrl);

    this.networkPassphrase = this.configService.get<string>(
      'STELLAR_NETWORK_PASSPHRASE',
      Networks.TESTNET,
    );

    this.networkMode =
      this.networkPassphrase === Networks.PUBLIC
        ? StellarNetworkMode.MAINNET
        : StellarNetworkMode.TESTNET;

    this.usdcIssuerPublicKey = this.configService.get<string>('STELLAR_USDC_ISSUER_PUBLIC', '');

    this.loadWalletKeys();
    this.validateEnvironment();
  }

  private loadWalletKeys(): void {
    const rolesConfig = [
      {
        role: StellarWalletRole.MASTER,
        pub: 'STELLAR_MASTER_PUBLIC',
        sec: 'STELLAR_MASTER_SECRET',
      },
      {
        role: StellarWalletRole.FEE,
        pub: 'STELLAR_FEE_PUBLIC',
        sec: 'STELLAR_FEE_SECRET',
      },
      {
        role: StellarWalletRole.LIQUIDITY,
        pub: 'STELLAR_LIQUIDITY_PUBLIC',
        sec: 'STELLAR_LIQUIDITY_SECRET',
      },
      {
        role: StellarWalletRole.ISSUER,
        pub: 'STELLAR_USDC_ISSUER_PUBLIC',
        sec: 'STELLAR_USDC_ISSUER_SECRET',
      },
    ];

    for (const item of rolesConfig) {
      const publicKey = this.configService.get<string>(item.pub, '');
      const secretKey = this.configService.get<string>(item.sec, '');

      if (publicKey && secretKey) {
        this.walletKeys.set(item.role, { publicKey, secretKey });
      }
    }
  }

  private validateEnvironment(): void {
    if (this.networkMode === StellarNetworkMode.MAINNET) {
      this.logger.warn('Stellar Network is running in MAINNET mode. Testnet endpoints will be disabled.');
      const mainnetCircleUsdcIssuer = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
      if (this.usdcIssuerPublicKey !== mainnetCircleUsdcIssuer) {
        this.logger.error(
          `Issuer mismatch! Production USDC issuer must be ${mainnetCircleUsdcIssuer}, got ${this.usdcIssuerPublicKey}`,
        );
      }
    } else {
      this.logger.log('Stellar Network is running in TESTNET mode.');
    }
  }

  /**
   * Fetches the dynamic network fee incorporating a buffer multiplier and fee cap
   */
  private async fetchCongestionFee(): Promise<string> {
    try {
      const baseFee = await this.server.fetchBaseFee();
      const multiplier = parseFloat(this.configService.get<string>('STELLAR_FEE_MULTIPLIER', '1.5'));
      const maxBaseFee = parseInt(this.configService.get<string>('STELLAR_MAX_BASE_FEE', '1000'), 10);
      const finalFee = Math.min(Math.round(baseFee * multiplier), maxBaseFee);
      return finalFee.toString();
    } catch (error) {
      this.logger.warn(`Failed to fetch Horizon base fee, falling back to default 100 stroops: ${error.message}`);
      return '100';
    }
  }

  public createKeyPair(): { publicKey: string; secretKey: string } {
    try {
      const keypair = Keypair.random();
      return {
        publicKey: keypair.publicKey(),
        secretKey: keypair.secret(),
      };
    } catch (error) {
      throw new BlockchainSettlementException(
        BlockchainErrorCode.TX_FAILED,
        'Failed to generate Stellar keypair',
        StellarLogSanitizer.sanitize(error),
      );
    }
  }

  public async fundWithFriendbot(publicKey: string): Promise<boolean> {
    if (this.networkMode === StellarNetworkMode.MAINNET) {
      throw new BlockchainSettlementException(
        BlockchainErrorCode.MINT_DISABLED_MAINNET,
        'Friendbot funding is disabled in MAINNET mode',
      );
    }

    try {
      this.logger.log(`Requesting Friendbot funding for ${publicKey}`);
      const response = await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
      return response.ok;
    } catch (error) {
      this.logger.error(`Friendbot funding failed: ${error.message}`);
      throw new BlockchainSettlementException(
        BlockchainErrorCode.HORIZON_UNREACHABLE,
        'Horizon Friendbot unreachable',
        StellarLogSanitizer.sanitize(error),
      );
    }
  }

  public async getAccountInfo(publicKey: string): Promise<StellarAccountInfo> {
    try {
      const account = await this.server.loadAccount(publicKey);
      
      const xlmBalance = account.balances.find((b: any) => b.asset_type === 'native')?.balance || '0';
      const usdcBalance =
        account.balances.find(
          (b: any) => b.asset_code === this.usdcAssetCode && b.asset_issuer === this.usdcIssuerPublicKey,
        )?.balance || '0';

      return {
        publicKey: account.accountId(),
        xlmBalance,
        usdcBalance,
        sequenceNumber: account.sequenceNumber(),
        trustlinesCount: account.balances.length,
      };
    } catch (error) {
      if (error.response?.status === 404) {
        throw new BlockchainSettlementException(
          BlockchainErrorCode.INVALID_DESTINATION,
          `Stellar account ${publicKey} does not exist on this network`,
        );
      }
      throw new BlockchainSettlementException(
        BlockchainErrorCode.HORIZON_UNREACHABLE,
        'Failed to retrieve account details from Horizon',
        StellarLogSanitizer.sanitize(error),
      );
    }
  }

  public async establishUsdcTrustline(walletPublicKey: string, walletSecretKey: string): Promise<string> {
    try {
      const keypair = Keypair.fromSecret(walletSecretKey);
      const account = await this.server.loadAccount(walletPublicKey);
      const usdcAsset = new Asset(this.usdcAssetCode, this.usdcIssuerPublicKey);

      const transaction = new TransactionBuilder(account, {
        fee: (await this.server.fetchBaseFee()).toString(),
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          Operation.changeTrust({
            asset: usdcAsset,
          }),
        )
        .setTimeout(TimeoutInfinite)
        .build();

      transaction.sign(keypair);
      const result = await this.server.submitTransaction(transaction);
      
      return result.hash;
    } catch (error) {
      const sanitized = StellarLogSanitizer.sanitize(error);
      this.logger.error('Failed to establish trustline', sanitized);
      
      this.mapHorizonError(error);
      throw new BlockchainSettlementException(
        BlockchainErrorCode.TX_FAILED,
        'Trustline creation failed',
        sanitized,
      );
    }
  }

  public async mintUsdc(destinationPublicKey: string, amount: string): Promise<StellarTransactionResult> {
    if (this.networkMode === StellarNetworkMode.MAINNET) {
      throw new BlockchainSettlementException(
        BlockchainErrorCode.MINT_DISABLED_MAINNET,
        'Minting mock USDC is disabled in MAINNET mode',
      );
    }

    const keys = this.walletKeys.get(StellarWalletRole.ISSUER);
    if (!keys) {
      throw new BlockchainSettlementException(
        BlockchainErrorCode.TX_FAILED,
        'Stellar Issuer keys are not configured in environment variables',
      );
    }

    const release = await this.lockManager.acquire(StellarWalletRole.ISSUER);

    try {
      await this.validateTrustline(destinationPublicKey);

      const issuerKeyPair = Keypair.fromSecret(keys.secretKey);
      const usdcAsset = new Asset(this.usdcAssetCode, this.usdcIssuerPublicKey);

      let attempts = 0;
      const maxAttempts = 2;
      let lastError: any = null;

      while (attempts < maxAttempts) {
        try {
          const issuerAccount = await this.server.loadAccount(keys.publicKey);
          const fee = await this.fetchCongestionFee();

          const transaction = new TransactionBuilder(issuerAccount, {
            fee,
            networkPassphrase: this.networkPassphrase,
          })
            .addOperation(
              Operation.payment({
                destination: destinationPublicKey,
                asset: usdcAsset,
                amount: amount.toString(),
              }),
            )
            .setTimeout(30)
            .build();

          transaction.sign(issuerKeyPair);
          const response = await this.server.submitTransaction(transaction);

          return {
            txHash: response.hash,
            ledger: response.ledger,
            createdAt: new Date().toISOString(),
            feeCharged: (response as any).fee_charged?.toString() || '0',
            sourceAccount: keys.publicKey,
          };
        } catch (error) {
          attempts++;
          lastError = error;
          const isSeqError = error.response?.data?.extras?.result_codes?.transaction === 'tx_bad_seq';
          if (isSeqError && attempts < maxAttempts) {
            this.logger.warn(`Minting sequence error detected. Retrying (Attempt ${attempts + 1}/${maxAttempts})...`);
            continue;
          }
          break;
        }
      }

      this.mapHorizonError(lastError);
      throw new BlockchainSettlementException(
        BlockchainErrorCode.TX_FAILED,
        'Minting operation failed',
        StellarLogSanitizer.sanitize(lastError),
      );
    } finally {
      await release();
    }
  }

  public async sendUsdc(params: {
    senderRole: StellarWalletRole;
    destinationPublicKey: string;
    amount: string;
    memo: string;
  }): Promise<StellarTransactionResult> {
    const keys = this.walletKeys.get(params.senderRole);
    if (!keys) {
      throw new BlockchainSettlementException(
        BlockchainErrorCode.TX_FAILED,
        `Wallet keys for role ${params.senderRole} are not configured`,
      );
    }

    try {
      Keypair.fromPublicKey(params.destinationPublicKey);
    } catch {
      throw new BlockchainSettlementException(
        BlockchainErrorCode.INVALID_DESTINATION,
        'Invalid destination Stellar public key format',
      );
    }

    if (!params.memo) {
      throw new BlockchainSettlementException(
        BlockchainErrorCode.MEMO_REQUIRED,
        'Transaction memo is required',
      );
    }

    const release = await this.lockManager.acquire(params.senderRole);

    try {
      await this.validateTrustline(params.destinationPublicKey);

      const senderKeyPair = Keypair.fromSecret(keys.secretKey);
      const usdcAsset = new Asset(this.usdcAssetCode, this.usdcIssuerPublicKey);

      let attempts = 0;
      const maxAttempts = 2;
      let lastError: any = null;

      while (attempts < maxAttempts) {
        try {
          const senderAccount = await this.server.loadAccount(keys.publicKey);

          if (attempts === 0) {
            const xlmBalance = parseFloat(
              senderAccount.balances.find((b: any) => b.asset_type === 'native')?.balance || '0',
            );

            const minReserve = parseFloat(this.configService.get<string>('STELLAR_MIN_XLM_RESERVE', '50'));
            if (xlmBalance < minReserve) {
              throw new BlockchainSettlementException(
                BlockchainErrorCode.XLM_RESERVE_CRITICAL,
                `Sender account XLM balance (${xlmBalance}) falls below critical reserve threshold (${minReserve} XLM)`,
              );
            }

            const usdcBalance = parseFloat(
              senderAccount.balances.find(
                (b: any) => b.asset_code === this.usdcAssetCode && b.asset_issuer === this.usdcIssuerPublicKey,
              )?.balance || '0',
            );

            const sendAmount = parseFloat(params.amount);
            if (usdcBalance < sendAmount) {
              throw new BlockchainSettlementException(
                BlockchainErrorCode.INSUFFICIENT_USDC_BALANCE,
                `Sender account has insufficient USDC. Balance: ${usdcBalance}, Required: ${sendAmount}`,
              );
            }
          }

          const fee = await this.fetchCongestionFee();

          const transaction = new TransactionBuilder(senderAccount, {
            fee,
            networkPassphrase: this.networkPassphrase,
          })
            .addOperation(
              Operation.payment({
                destination: params.destinationPublicKey,
                asset: usdcAsset,
                amount: params.amount,
              }),
            )
            .addMemo(Memo.text(params.memo))
            .setTimeout(30)
            .build();

          transaction.sign(senderKeyPair);
          const response = await this.server.submitTransaction(transaction);

          return {
            txHash: response.hash,
            ledger: response.ledger,
            createdAt: new Date().toISOString(),
            feeCharged: (response as any).fee_charged?.toString() || '0',
            sourceAccount: keys.publicKey,
            memo: params.memo,
          };
        } catch (error) {
          if (error instanceof BlockchainSettlementException) {
            throw error;
          }
          attempts++;
          lastError = error;
          const isSeqError = error.response?.data?.extras?.result_codes?.transaction === 'tx_bad_seq';
          if (isSeqError && attempts < maxAttempts) {
            this.logger.warn(`Payment sequence error detected. Retrying (Attempt ${attempts + 1}/${maxAttempts})...`);
            continue;
          }
          break;
        }
      }

      this.mapHorizonError(lastError);
      throw new BlockchainSettlementException(
        BlockchainErrorCode.TX_FAILED,
        'Payment submission failed',
        StellarLogSanitizer.sanitize(lastError),
      );
    } finally {
      await release();
    }
  }

  public async verifyTransaction(txHash: string): Promise<StellarTransactionVerification> {
    try {
      const response = await this.server.transactions().transaction(txHash).call();
      return {
        exists: true,
        successful: response.successful,
        ledger: response.ledger_attr,
        createdAt: response.created_at,
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return {
          exists: false,
          successful: false,
        };
      }
      throw new BlockchainSettlementException(
        BlockchainErrorCode.HORIZON_UNREACHABLE,
        'Failed to connect to Stellar network to verify transaction',
        StellarLogSanitizer.sanitize(error),
      );
    }
  }

  private async validateTrustline(publicKey: string): Promise<void> {
    try {
      const account = await this.server.loadAccount(publicKey);
      const hasUsdcTrust = account.balances.some(
        (b: any) => b.asset_code === this.usdcAssetCode && b.asset_issuer === this.usdcIssuerPublicKey,
      );

      if (!hasUsdcTrust) {
        throw new BlockchainSettlementException(
          BlockchainErrorCode.DESTINATION_NO_TRUSTLINE,
          `Destination account ${publicKey} does not trust USDC issued by our control account`,
        );
      }
    } catch (error) {
      if (error instanceof BlockchainSettlementException) {
        throw error;
      }
      if (error.response?.status === 404) {
        throw new BlockchainSettlementException(
          BlockchainErrorCode.INVALID_DESTINATION,
          `Destination account ${publicKey} does not exist on Stellar network. Create and fund it first.`,
        );
      }
      throw new BlockchainSettlementException(
        BlockchainErrorCode.HORIZON_UNREACHABLE,
        'Horizon verification check failed',
        StellarLogSanitizer.sanitize(error),
      );
    }
  }

  private mapHorizonError(error: any): void {
    if (!error.response?.data) return;

    const data = error.response.data;
    const resultCodes = data.extras?.result_codes;

    if (resultCodes) {
      const txResult = resultCodes.transaction;
      const opResults = resultCodes.operations || [];

      if (txResult === 'tx_bad_seq') {
        throw new BlockchainSettlementException(
          BlockchainErrorCode.TX_BAD_SEQUENCE,
          'Transaction submission failed due to sequence number mismatch',
          data,
        );
      }

      if (txResult === 'tx_insufficient_fee') {
        throw new BlockchainSettlementException(
          BlockchainErrorCode.INSUFFICIENT_XLM_RESERVE,
          'Transaction failed: Insufficient XLM for transaction fees',
          data,
        );
      }

      if (opResults.includes('op_no_destination') || opResults.includes('op_no_trust')) {
        throw new BlockchainSettlementException(
          BlockchainErrorCode.DESTINATION_NO_TRUSTLINE,
          'Transaction failed: Destination account lacks trustline for USDC',
          data,
        );
      }

      if (opResults.includes('op_underfunded')) {
        throw new BlockchainSettlementException(
          BlockchainErrorCode.INSUFFICIENT_USDC_BALANCE,
          'Transaction failed: Account has insufficient USDC balance',
          data,
        );
      }
    }

    if (error.response.status === 504) {
      throw new BlockchainSettlementException(
        BlockchainErrorCode.TX_TIMEOUT,
        'Horizon gateway timeout waiting for transaction settlement',
        data,
      );
    }
  }

  public getPublicKeyForRole(role: StellarWalletRole): string {
    const keys = this.walletKeys.get(role);
    if (!keys) {
      throw new BlockchainSettlementException(
        BlockchainErrorCode.TX_FAILED,
        `Wallet keys for role ${role} are not configured`,
      );
    }
    return keys.publicKey;
  }
}
