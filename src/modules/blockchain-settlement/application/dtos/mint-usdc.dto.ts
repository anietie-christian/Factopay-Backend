// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumberString } from 'class-validator';
import { IsStellarPublicKey } from './decorators/is-stellar-public-key.decorator';

export class MintUsdcDto {
  @ApiProperty({
    description: 'The target Stellar public key address to receive mock USDC',
    example: 'GBBD47IF6LWK7P7TZS2ADQDPTO2DMTM26IE6XYVJ65P3ENW6CIH2WCNR',
  })
  @IsStellarPublicKey()
  @IsNotEmpty()
  destinationPublicKey: string;

  @ApiProperty({
    description: 'Amount of mock USDC to mint (as a string)',
    example: '50000.0000',
  })
  @IsNumberString()
  @IsNotEmpty()
  amount: string;
}
