import { Controller, UseGuards, Get, Post, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GetLiveRatesUseCase } from '../../application/use-cases/get-live-rates.use-case';
import { LockFxQuoteUseCase } from '../../application/use-cases/lock-fx-quote.use-case';
import { GetLiveRatesDto, LockQuoteDto } from '../../application/dtos/rates.dto';

@ApiTags('FX Rates')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('rates')
export class RatesController {
  constructor(
    private readonly getLiveRatesUseCase: GetLiveRatesUseCase,
    private readonly lockFxQuoteUseCase: LockFxQuoteUseCase,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Get live FX rates' })
  @ApiResponse({ status: 200, description: 'Live rates returned.' })
  async getLiveRates(@Query() query: GetLiveRatesDto) {
    return this.getLiveRatesUseCase.execute(query.sourceCurrency, query.targetCurrency);
  }

  @Post('quote')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Lock an FX quote for 30 seconds' })
  @ApiResponse({ status: 201, description: 'Quote locked successfully and quoteId returned.' })
  async lockQuote(@Body() body: LockQuoteDto) {
    return this.lockFxQuoteUseCase.execute(body.sourceCurrency, body.targetCurrency);
  }
}
