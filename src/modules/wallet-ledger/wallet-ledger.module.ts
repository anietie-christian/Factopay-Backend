// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Module } from '@nestjs/common';
import { ProvisionWalletUseCase } from './application/use-cases/provision-wallet.use-case';
import { CalculateBalanceUseCase } from './application/use-cases/calculate-balance.use-case';
import { PostLedgerTransactionUseCase } from './application/use-cases/post-ledger-transaction.use-case';
import { ReverseLedgerTransactionUseCase } from './application/use-cases/reverse-ledger-transaction.use-case';
import { PrismaWalletRepository } from './infrastructure/repositories/prisma-wallet.repository';
import { PrismaLedgerRepository } from './infrastructure/repositories/prisma-ledger.repository';
import { DoubleEntryEngine } from './domain/services/double-entry.engine';
import { KycApprovedListener } from './infrastructure/listeners/kyc-approved.listener';
import { WalletController } from './infrastructure/controllers/wallet.controller';

import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule], // For PrismaService and Auth/Roles
  controllers: [WalletController],
  providers: [
    { provide: 'WalletRepository', useClass: PrismaWalletRepository },
    { provide: 'LedgerRepository', useClass: PrismaLedgerRepository },
    PrismaWalletRepository,
    PrismaLedgerRepository,
    DoubleEntryEngine,
    ProvisionWalletUseCase,
    CalculateBalanceUseCase,
    PostLedgerTransactionUseCase,
    ReverseLedgerTransactionUseCase,
    KycApprovedListener,

  ],
  exports: [
    PostLedgerTransactionUseCase,
    ReverseLedgerTransactionUseCase,
    CalculateBalanceUseCase,
    ProvisionWalletUseCase,
  ],
})
export class WalletLedgerModule {}
