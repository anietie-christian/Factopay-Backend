import { Module } from '@nestjs/common';
import { TransferController } from './infrastructure/controllers/transfer.controller';
import { RatesController } from './infrastructure/controllers/rates.controller';
import { AdminTransferController } from './infrastructure/controllers/admin-transfer.controller';
import { InitiateTransferUseCase } from './application/use-cases/initiate-transfer.use-case';
import { GetTransferUseCase } from './application/use-cases/get-transfer.use-case';
import { GetTransferByKeyUseCase } from './application/use-cases/get-transfer-by-key.use-case';
import { ListTransfersUseCase } from './application/use-cases/list-transfers.use-case';
import { GetLiveRatesUseCase } from './application/use-cases/get-live-rates.use-case';
import { LockFxQuoteUseCase } from './application/use-cases/lock-fx-quote.use-case';
import { AdminListTransfersUseCase } from './application/use-cases/admin-list-transfers.use-case';
import { AdminReviewTransferUseCase } from './application/use-cases/admin-review-transfer.use-case';
import { AdminCancelTransferUseCase } from './application/use-cases/admin-cancel-transfer.use-case';
import { AdminResolveTransferUseCase } from './application/use-cases/admin-resolve-transfer.use-case';
import { AdminRetryTransferUseCase } from './application/use-cases/admin-retry-transfer.use-case';
import { AdminRefundTransferUseCase } from './application/use-cases/admin-refund-transfer.use-case';
import { UserCancelTransferUseCase } from './application/use-cases/user-cancel-transfer.use-case';
import { SharedModule } from '../shared/shared.module';
import { BlockchainSettlementModule } from '../blockchain-settlement/blockchain-settlement.module';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module';

@Module({
  imports: [SharedModule, BlockchainSettlementModule, WalletLedgerModule],
  controllers: [TransferController, RatesController, AdminTransferController],
  providers: [
    InitiateTransferUseCase,
    GetTransferUseCase,
    GetTransferByKeyUseCase,
    ListTransfersUseCase,
    GetLiveRatesUseCase,
    LockFxQuoteUseCase,
    AdminListTransfersUseCase,
    AdminReviewTransferUseCase,
    AdminCancelTransferUseCase,
    AdminResolveTransferUseCase,
    AdminRetryTransferUseCase,
    AdminRefundTransferUseCase,
    UserCancelTransferUseCase,
  ],
  exports: [InitiateTransferUseCase],
})
export class TransferEngineModule {}
