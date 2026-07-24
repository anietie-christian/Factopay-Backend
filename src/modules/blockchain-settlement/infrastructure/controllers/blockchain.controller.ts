// ---------------------------------------------------------------------------------------------------------------#*eddiere
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  Ip,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Inject,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../../shared/infrastructure/guards/roles.guard';
import { Roles } from '../../../shared/infrastructure/guards/roles.decorator';

import { SubmitSettlementUseCase } from '../../application/use-cases/submit-settlement.use-case';
import { VerifySettlementUseCase } from '../../application/use-cases/verify-settlement.use-case';
import { MintTestUsdcUseCase } from '../../application/use-cases/mint-test-usdc.use-case';
import { GetBlockchainTransactionUseCase } from '../../application/use-cases/get-blockchain-transaction.use-case';
import { CreateStellarAccountUseCase } from '../../application/use-cases/create-stellar-account.use-case';
import { ListBlockchainTransactionsUseCase } from '../../application/use-cases/list-blockchain-transactions.use-case';
import { ListStellarWalletsUseCase } from '../../application/use-cases/list-stellar-wallets.use-case';
import {
  IStellarGateway,
  STELLAR_GATEWAY_TOKEN,
  StellarWalletRole,
} from '../../domain/gateways/stellar-gateway.interface';

import { SendUsdcDto } from '../../application/dtos/send-usdc.dto';
import { MintUsdcDto } from '../../application/dtos/mint-usdc.dto';
import { ProvisionWalletDto } from '../../application/dtos/provision-wallet.dto';
import { GetBlockchainTransactionsQueryDto } from '../../application/dtos/get-blockchain-transactions-query.dto';
import { GetStellarWalletsQueryDto } from '../../application/dtos/get-stellar-wallets-query.dto';

@ApiTags('Admin - Blockchain Settlement')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('blockchain')
export class BlockchainController {
  constructor(
    private readonly submitSettlementUseCase: SubmitSettlementUseCase,
    private readonly verifySettlementUseCase: VerifySettlementUseCase,
    private readonly mintTestUsdcUseCase: MintTestUsdcUseCase,
    private readonly getTxUseCase: GetBlockchainTransactionUseCase,
    private readonly createAccountUseCase: CreateStellarAccountUseCase,
    private readonly listTxsUseCase: ListBlockchainTransactionsUseCase,
    private readonly listWalletsUseCase: ListStellarWalletsUseCase,
    @Inject(STELLAR_GATEWAY_TOKEN)
    private readonly stellarGateway: IStellarGateway,
  ) {}

  @Post('send')
  @Roles('ADMIN', 'SUPERADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a USDC settlement payment to Stellar network' })
  @ApiResponse({ status: 200, description: 'Settlement submitted and completed successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or processing limit exceeded' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async sendSettlement(
    @Body() dto: SendUsdcDto,
    @Request() req: any,
    @Ip() ipAddress: string,
  ) {
    const adminId = req.user?.id || '00000000-0000-0000-0000-000000000000';
    return this.submitSettlementUseCase.execute({
      transferId: dto.transferId,
      destinationPublicKey: dto.destinationPublicKey,
      amount: dto.amount,
      memo: dto.memo,
      adminId,
      ipAddress,
    });
  }

  @Get('transactions/:id')
  @Roles('SUPPORT', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Retrieve details of a blockchain transaction' })
  @ApiResponse({ status: 200, description: 'Returns the transaction details' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async getTransaction(@Param('id') id: string) {
    return this.getTxUseCase.execute(id);
  }

  @Post('transactions/:id/verify')
  @Roles('ADMIN', 'SUPERADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually poll and verify a pending transaction status on Horizon' })
  @ApiResponse({ status: 200, description: 'Returns verified transaction status' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async verifyTransaction(@Param('id') id: string) {
    return this.verifySettlementUseCase.execute(id);
  }

  @Post('testnet/mint')
  @Roles('SUPERADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mint mock USDC for testing (Testnet mode only)' })
  @ApiResponse({ status: 200, description: 'Mock USDC minted successfully' })
  @ApiResponse({ status: 400, description: 'Minting fails due to limits or network mode' })
  async mintTestUsdc(@Body() dto: MintUsdcDto) {
    return this.mintTestUsdcUseCase.execute(dto.destinationPublicKey, dto.amount);
  }

  @Post('wallets/provision')
  @Roles('ADMIN', 'SUPERADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Provision a new custodial Stellar wallet for a user' })
  @ApiResponse({ status: 201, description: 'Wallet provisioned successfully (or returned existing)' })
  @ApiResponse({ status: 400, description: 'Provisioning failed' })
  async provisionWallet(@Body() dto: ProvisionWalletDto) {
    return this.createAccountUseCase.execute(dto.userId);
  }

  @Get('wallets/:role/health')
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Check balance and health of a specific custodial wallet role' })
  @ApiResponse({ status: 200, description: 'Returns wallet public key, native balance, and trustline checks' })
  @ApiResponse({ status: 400, description: 'Invalid role parameter' })
  async checkWalletHealth(@Param('role') role: string) {
    // Validate role parameter is a valid enum value
    const walletRole = role.toUpperCase() as StellarWalletRole;
    if (!Object.values(StellarWalletRole).includes(walletRole)) {
      throw new BadRequestException(
        `Invalid wallet role: ${role}. Allowed values are: ${Object.values(StellarWalletRole).join(', ')}`,
      );
    }

    try {
      const publicKey = this.stellarGateway.getPublicKeyForRole(walletRole);
      const info = await this.stellarGateway.getAccountInfo(publicKey);
      return {
        role: walletRole,
        ...info,
        configured: true,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to retrieve account health details for role ${role}: ${error.message}`,
      );
    }
  }

  @Get('transactions')
  @Roles('SUPPORT', 'ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'List and search blockchain transactions' })
  @ApiResponse({ status: 200, description: 'Returns a paginated list of blockchain transactions' })
  async listTransactions(@Query() query: GetBlockchainTransactionsQueryDto) {
    return this.listTxsUseCase.execute(query);
  }

  @Get('wallets')
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'List and search custodial stellar wallets' })
  @ApiResponse({ status: 200, description: 'Returns a paginated list of custodial wallets' })
  async listWallets(@Query() query: GetStellarWalletsQueryDto) {
    return this.listWalletsUseCase.execute(query);
  }
}
