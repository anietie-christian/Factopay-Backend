import { IsString, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AdminUpdateRoleDto {
  @ApiProperty({ example: 'ADMIN', enum: ['USER', 'SUPPORT', 'ADMIN'] })
  @IsString()
  @IsNotEmpty()
  @IsIn(['USER', 'SUPPORT', 'ADMIN'])
  role: string;
}
