// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable, Inject } from '@nestjs/common';
import {
  IBlockchainRepository,
  BLOCKCHAIN_REPOSITORY_TOKEN,
} from '../../domain/repositories/blockchain-repository.interface';
import { GetStellarWalletsQueryDto } from '../dtos/get-stellar-wallets-query.dto';

@Injectable()
export class ListStellarWalletsUseCase {
  constructor(
    @Inject(BLOCKCHAIN_REPOSITORY_TOKEN)
    private readonly repository: IBlockchainRepository,
  ) {}

  async execute(query: GetStellarWalletsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const { data, total } = await this.repository.findManyWallets({
      isActive: query.isActive,
      page,
      limit,
    });

    // Sanitize encryptedSecret before returning to admin client
    const sanitizedData = data.map((wallet) => {
      const { encryptedSecret, ...rest } = wallet;
      return {
        ...rest,
        hasEncryptedSecret: !!encryptedSecret,
      };
    });

    return {
      data: sanitizedData,
      meta: {
        totalItems: total,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }
}
