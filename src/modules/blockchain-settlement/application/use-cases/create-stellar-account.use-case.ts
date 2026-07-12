import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IStellarGateway,
  STELLAR_GATEWAY_TOKEN,
} from '../../domain/gateways/stellar-gateway.interface';
import {
  IBlockchainRepository,
  BLOCKCHAIN_REPOSITORY_TOKEN,
} from '../../domain/repositories/blockchain-repository.interface';
import { WalletCrypt } from '../../infrastructure/security/wallet-crypt';

@Injectable()
export class CreateStellarAccountUseCase {
  private readonly logger = new Logger(CreateStellarAccountUseCase.name);

  constructor(
    @Inject(STELLAR_GATEWAY_TOKEN)
    private readonly stellarGateway: IStellarGateway,
    @Inject(BLOCKCHAIN_REPOSITORY_TOKEN)
    private readonly repository: IBlockchainRepository,
    private readonly configService: ConfigService,
  ) {}

  async execute(userId: string): Promise<{ publicKey: string }> {
    this.logger.log(`Provisioning Stellar wallet for user ${userId}`);

    // Idempotency: check if wallet already exists
    const existingWallet = await this.repository.findWalletByUserId(userId);
    if (existingWallet) {
      this.logger.log(`User ${userId} already has Stellar wallet: ${existingWallet.publicKey}`);
      return { publicKey: existingWallet.publicKey };
    }

    // 1. Generate keypair
    const { publicKey, secretKey } = this.stellarGateway.createKeyPair();

    // 2. Fund with Friendbot (MVP Testnet behavior)
    // NOTE: When transitioning to MAINNET:
    //   1. Replace friendbot funding with a Stellar payment operation from the FEE/MASTER wallet.
    //   2. Use the 'Create Account' operation to send a minimum of 1.5 to 2.0 XLM to initialize the new account.
    //   3. Alternatively, implement 'Reserve Sponsorship' (BeginSponsoringFutureReserves) from the MASTER wallet
    //      so user wallets do not need to lock native XLM balances for the USDC trustline.
    try {
      await this.stellarGateway.fundWithFriendbot(publicKey);
    } catch (error) {
      this.logger.error(`Failed to fund new account ${publicKey} with Friendbot`, error);
      throw error;
    }

    // 3. Establish USDC trustline
    try {
      await this.stellarGateway.establishUsdcTrustline(publicKey, secretKey);
    } catch (error) {
      this.logger.error(`Failed to establish USDC trustline for new account ${publicKey}`, error);
      throw error;
    }

    // 4. Encrypt secret key
    const encryptionPassphrase = this.configService.get<string>('STELLAR_WALLET_ENCRYPTION_KEY');
    if (!encryptionPassphrase) {
      throw new Error('STELLAR_WALLET_ENCRYPTION_KEY environment variable is not set');
    }
    const encryptedSecret = WalletCrypt.encrypt(secretKey, encryptionPassphrase);

    // 5. Persist to DB
    const savedWallet = await this.repository.createStellarWallet({
      userId,
      publicKey,
      encryptedSecret,
    });

    // 6. Update trustline status
    await this.repository.updateWalletTrustline(userId, true);

    this.logger.log(`Successfully provisioned Stellar wallet ${publicKey} for user ${userId}`);
    return { publicKey: savedWallet.publicKey };
  }
}
