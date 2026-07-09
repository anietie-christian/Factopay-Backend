import { IsString, IsNotEmpty, IsIn, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminUpgradeTierDto {
  @ApiProperty({ example: 'TIER_2', enum: ['TIER_1', 'TIER_2', 'TIER_3'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['TIER_1', 'TIER_2', 'TIER_3'])
  newTier: string;

  @ApiProperty({ example: 'Enhanced due diligence completed' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason: string;
}
