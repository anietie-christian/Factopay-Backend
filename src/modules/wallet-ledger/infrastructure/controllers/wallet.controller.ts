import { Controller, Get, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CalculateBalanceUseCase } from '../../application/use-cases/calculate-balance.use-case';
import { LedgerRepository } from '../../domain/ports/ledger.repository';
import { PrismaLedgerRepository } from '../repositories/prisma-ledger.repository';
import { RolesGuard } from '../../../shared/infrastructure/guards/roles.guard';
import { Roles } from '../../../shared/infrastructure/guards/roles.decorator';
import { WalletRepository } from '../../domain/ports/wallet.repository';
import { PrismaWalletRepository } from '../repositories/prisma-wallet.repository';
import { NotFoundException, ForbiddenException, Inject } from '@nestjs/common';

@ApiTags('Wallet')
@Controller('api/v1/wallet')
@UseGuards(RolesGuard)
@ApiBearerAuth()
export class WalletController {
  constructor(
    private readonly calculateBalanceUseCase: CalculateBalanceUseCase,
    @Inject('LedgerRepository') private readonly ledgerRepository: LedgerRepository,
    @Inject('WalletRepository') private readonly walletRepository: WalletRepository,
  ) {}

  @Get('balance/:userId/:currency')
  @Roles('USER', 'ADMIN')
  @ApiOperation({ summary: 'Get the balance of a specific wallet' })
  async getBalance(@Request() req: any, @Param('userId') userId: string, @Param('currency') currency: string) {
    const isUser = req.user?.roles?.includes('USER') || req.user?.role === 'USER';
    const isAdmin = req.user?.roles?.includes('ADMIN') || req.user?.role === 'ADMIN';
    
    if (!isAdmin && req.user?.userId !== userId && req.user?.id !== userId) {
      throw new ForbiddenException('You can only view your own balance');
    }

    const balance = await this.calculateBalanceUseCase.execute(userId, currency.toUpperCase());
    return { balance: balance.toString(), currency: currency.toUpperCase() };
  }

  @Get('ledger/:userId/:currency')
  @Roles('USER', 'ADMIN')
  @ApiOperation({ summary: 'Get paginated ledger entries for a specific wallet' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getLedger(
    @Request() req: any, 
    @Param('userId') userId: string,
    @Param('currency') currency: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    const isAdmin = req.user?.roles?.includes('ADMIN') || req.user?.role === 'ADMIN';
    
    if (!isAdmin && req.user?.userId !== userId && req.user?.id !== userId) {
      throw new ForbiddenException('You can only view your own ledger');
    }

    const wallet = await this.walletRepository.findByUserAndCurrency(userId, currency.toUpperCase());
    if (!wallet || !(wallet as any).accounts?.[0]) {
      throw new NotFoundException('Wallet or ledger account not found');
    }

    const accountId = (wallet as any).accounts[0].id;
    const entries = await this.ledgerRepository.paginateByAccount(accountId, Number(page), Number(limit));
    return {
      entries,
      page: Number(page),
      limit: Number(limit)
    };
  }
}
