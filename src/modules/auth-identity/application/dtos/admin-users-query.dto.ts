import { IsOptional, IsString, IsBoolean, IsInt, Min, Max, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class AdminUsersQueryDto {
  @ApiPropertyOptional({ description: 'Search by name, email or phone' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['USER', 'SUPPORT', 'ADMIN', 'SUPERADMIN'] })
  @IsOptional()
  @IsString()
  @IsIn(['USER', 'SUPPORT', 'ADMIN', 'SUPERADMIN'])
  role?: string;

  @ApiPropertyOptional({ enum: ['UNVERIFIED', 'PENDING', 'APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED'] })
  @IsOptional()
  @IsString()
  kycStatus?: string;

  @ApiPropertyOptional({ description: 'Filter active or suspended accounts' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 'createdAt' })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'lastLoginAt', 'email'])
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ default: 'desc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
