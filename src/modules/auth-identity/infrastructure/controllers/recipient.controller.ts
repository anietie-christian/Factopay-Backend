import { Controller, Get, Post, Body, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';

@ApiTags('Recipients')
@ApiBearerAuth()
@Controller('recipients')
@UseGuards(AuthGuard('jwt'))
export class RecipientController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List saved recipients' })
  @ApiResponse({ status: 200, description: 'Recipients retrieved successfully' })
  async getRecipients(@Req() req: any) {
    return this.prisma.recipient.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a new recipient' })
  @ApiResponse({ status: 201, description: 'Recipient created' })
  async addRecipient(@Req() req: any, @Body() dto: any) {
    const { name, accountNumber, bankName } = dto;
    return this.prisma.recipient.create({
      data: {
        userId: req.user.id,
        name,
        accountNumber,
        bankName
      }
    });
  }
}
