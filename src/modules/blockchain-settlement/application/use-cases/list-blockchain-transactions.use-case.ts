import { Injectable, Inject } from '@nestjs/common';
import {
  IBlockchainRepository,
  BLOCKCHAIN_REPOSITORY_TOKEN,
} from '../../domain/repositories/blockchain-repository.interface';
import { GetBlockchainTransactionsQueryDto } from '../dtos/get-blockchain-transactions-query.dto';

@Injectable()
export class ListBlockchainTransactionsUseCase {
  constructor(
    @Inject(BLOCKCHAIN_REPOSITORY_TOKEN)
    private readonly repository: IBlockchainRepository,
  ) {}

  async execute(query: GetBlockchainTransactionsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    
    const { data, total } = await this.repository.findManyTransactions({
      status: query.status,
      page,
      limit,
    });

    return {
      data,
      meta: {
        totalItems: total,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }
}
