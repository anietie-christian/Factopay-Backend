import { IsOptional, IsString, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RequestClosureDto {
  @ApiPropertyOptional({ example: 'Moving to another service provider', description: 'Reason for closure' })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}
