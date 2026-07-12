import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  IBlockchainRepository,
  BLOCKCHAIN_REPOSITORY_TOKEN,
} from '../../domain/repositories/blockchain-repository.interface';
import { BlockchainTransaction } from '@prisma/client';

@Injectable()
export class GetBlockchainTransactionUseCase {
  constructor(
    @Inject(BLOCKCHAIN_REPOSITORY_TOKEN)
    private readonly repository: IBlockchainRepository,
  ) {}

  async execute(id: string): Promise<BlockchainTransaction> {
    const tx = await this.repository.findTransactionById(id);
    if (!tx) {
      throw new NotFoundException(`Blockchain transaction with ID ${id} not found`);
    }
    return tx;
  }
}
