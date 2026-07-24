// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export class AdminListTransfersQueryDto {
  @ApiPropertyOptional({ description: 'Filter by transfer status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by admin review status' })
  @IsOptional()
  @IsString()
  adminReviewStatus?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class AdminReviewTransferDto {
  @ApiProperty({ description: 'Review decision: APPROVED or REJECTED', example: 'APPROVED' })
  @IsEnum(['APPROVED', 'REJECTED'])
  decision: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ description: 'Notes justifying the decision', example: 'Verified destination allowlist and KYC.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AdminResolveTransferDto {
  @ApiProperty({ description: 'Notes detailing manual resolution details', example: 'Manually processed via Horizon ledger index 12345.' })
  @IsString()
  notes: string;
}

export class AdminCancelTransferDto {
  @ApiProperty({ description: 'Reason for cancellation', example: 'Suspected fraud or user request.' })
  @IsString()
  reason: string;
}

export class AdminRetryTransferDto {
  @ApiProperty({ description: 'Notes justifying the retry', example: 'Network issue resolved.' })
  @IsString()
  notes: string;
}

export class AdminRefundTransferDto {
  @ApiProperty({ description: 'Reason for refund', example: 'User requested refund after failed transaction.' })
  @IsString()
  reason: string;
}
