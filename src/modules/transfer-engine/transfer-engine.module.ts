import { Module } from '@nestjs/common';
import { TransferController } from './infrastructure/controllers/transfer.controller';
import { RatesController } from './infrastructure/controllers/rates.controller';
import { InitiateTransferUseCase } from './application/use-cases/initiate-transfer.use-case';
import { GetLiveRatesUseCase } from './application/use-cases/get-live-rates.use-case';
import { LockFxQuoteUseCase } from './application/use-cases/lock-fx-quote.use-case';
import { SharedModule } from '../shared/shared.module';
import { BlockchainSettlementModule } from '../blockchain-settlement/blockchain-settlement.module';
import { WalletLedgerModule } from '../wallet-ledger/wallet-ledger.module';

@Module({
  imports: [SharedModule, BlockchainSettlementModule, WalletLedgerModule],
  controllers: [TransferController, RatesController],
  providers: [InitiateTransferUseCase, GetLiveRatesUseCase, LockFxQuoteUseCase],
  exports: [InitiateTransferUseCase],
})
export class TransferEngineModule {}
