import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { GetLiveRatesUseCase } from '../../application/use-cases/get-live-rates.use-case';
import { LockFxQuoteUseCase } from '../../application/use-cases/lock-fx-quote.use-case';
import { GetLiveRatesDto, LockQuoteDto } from '../../application/dtos/rates.dto';

@ApiTags('FX Rates')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth()
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
