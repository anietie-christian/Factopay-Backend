import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IStellarGateway,
  STELLAR_GATEWAY_TOKEN,
  StellarTransactionResult,
} from '../../domain/gateways/stellar-gateway.interface';
import {
  IBlockchainRepository,
  BLOCKCHAIN_REPOSITORY_TOKEN,
} from '../../domain/repositories/blockchain-repository.interface';
import {
  BlockchainErrorCode,
  BlockchainSettlementException,
} from '../../domain/errors/blockchain-errors';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

@Injectable()
export class MintTestUsdcUseCase {
  private readonly logger = new Logger(MintTestUsdcUseCase.name);
  private readonly singleMintCap = new Decimal('100000.0000');
  private readonly dailyMintCap = new Decimal('1000000.0000');

  constructor(
    @Inject(STELLAR_GATEWAY_TOKEN)
    private readonly stellarGateway: IStellarGateway,
    @Inject(BLOCKCHAIN_REPOSITORY_TOKEN)
    private readonly repository: IBlockchainRepository,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(destinationPublicKey: string, amount: string): Promise<StellarTransactionResult> {
    this.logger.log(`Processing mint request of ${amount} USDC to ${destinationPublicKey}`);

    // 1. Runtime guard: only TESTNET network allows minting
    const networkPassphrase = this.configService.get<string>('STELLAR_NETWORK_PASSPHRASE', '');
    const isMainnet = networkPassphrase.includes('Public Global Stellar Network');
    if (isMainnet) {
      throw new BlockchainSettlementException(
        BlockchainErrorCode.MINT_DISABLED_MAINNET,
        'Minting mock USDC is strictly disabled in MAINNET mode',
      );
    }

    const mintAmount = new Decimal(amount);

    // 2. Validate single transaction limit (100,000 USDC)
    if (mintAmount.greaterThan(this.singleMintCap)) {
      throw new BlockchainSettlementException(
        BlockchainErrorCode.AMOUNT_EXCEEDS_LIMIT,
        `Single mint amount ${amount} USDC exceeds maximum allowed limit of ${this.singleMintCap.toString()} USDC`,
      );
    }

    // 3. Validate daily aggregate mint limit (1,000,000 USDC)
    const startOfUtcDay = new Date();
    startOfUtcDay.setUTCHours(0, 0, 0, 0);

    const endOfUtcDay = new Date();
    endOfUtcDay.setUTCHours(23, 59, 59, 999);

    const issuerPublicKey = this.configService.get<string>('STELLAR_USDC_ISSUER_PUBLIC', '');
    
    // Sum successful mints created today
    const dailyMints = await this.prisma.blockchainTransaction.findMany({
      where: {
        sourceAddress: issuerPublicKey,
        status: 'SUCCESS',
        createdAt: {
          gte: startOfUtcDay,
          lte: endOfUtcDay,
        },
      },
      select: {
        amount: true,
      },
    });

    let dailyTotal = new Decimal(0);
    for (const mint of dailyMints) {
      dailyTotal = dailyTotal.plus(mint.amount);
    }

    const projectedTotal = dailyTotal.plus(mintAmount);
    if (projectedTotal.greaterThan(this.dailyMintCap)) {
      throw new BlockchainSettlementException(
        BlockchainErrorCode.DAILY_OUTFLOW_EXCEEDED,
        `Projected daily minting total ${projectedTotal.toString()} USDC exceeds daily maximum limit of ${this.dailyMintCap.toString()} USDC (Today: ${dailyTotal.toString()} USDC)`,
      );
    }

    // 4. Generate a unique transfer ID for tracking this test mint transaction in database
    const syntheticTransferId = crypto.randomUUID();

    // 5. Create PENDING transaction record
    const dbTx = await this.repository.createTransaction({
      transferId: syntheticTransferId,
      sourceAddress: issuerPublicKey,
      destAddress: destinationPublicKey,
      amount: amount,
      memo: 'TESTNET-MINT',
      status: 'PENDING',
    });

    try {
      // 6. Submit minting operation
      const result = await this.stellarGateway.mintUsdc(destinationPublicKey, amount);

      // 7. Update database record on success
      await this.repository.updateTransactionStatus(dbTx.id, {
        status: 'SUCCESS',
        txHash: result.txHash,
        ledger: result.ledger,
      });

      this.logger.log(`Successfully minted ${amount} USDC to ${destinationPublicKey}. Hash: ${result.txHash}`);
      return result;
    } catch (error) {
      this.logger.error(`Minting failed for target ${destinationPublicKey}`, error);

      // Extract error details
      const errorCode = error instanceof BlockchainSettlementException ? error.code : BlockchainErrorCode.TX_FAILED;
      const errorMessage = error.message || 'Unknown minting error';

      await this.repository.updateTransactionStatus(dbTx.id, {
        status: 'FAILED',
        errorCode: errorCode.toString(),
        errorMessage,
      });

      throw error;
    }
  }
}
