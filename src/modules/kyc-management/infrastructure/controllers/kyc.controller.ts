import { Controller, Post, Get, Body, Request, UseGuards, Headers, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { SubmitBasicProfileUseCase } from '../../application/use-cases/submit-basic-profile.use-case';
import { InitiateKycCheckUseCase } from '../../application/use-cases/initiate-kyc-check.use-case';
import { GetKycStatusUseCase } from '../../application/use-cases/get-kyc-status.use-case';
import { HandleKycWebhookUseCase } from '../../application/use-cases/handle-kyc-webhook.use-case';
import { SubmitBasicProfileDto } from '../../application/dtos/submit-basic-profile.dto';
import { SumsubWebhookDto } from '../../application/dtos/sumsub-webhook.dto';

@ApiTags('KYC')
@Controller('kyc')
export class KycController {
  constructor(
    private readonly submitBasicProfileUseCase: SubmitBasicProfileUseCase,
    private readonly initiateKycCheckUseCase: InitiateKycCheckUseCase,
    private readonly getKycStatusUseCase: GetKycStatusUseCase,
    private readonly handleKycWebhookUseCase: HandleKycWebhookUseCase,
  ) { }

  @Post('basic-profile')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async submitBasicProfile(@Request() req: any, @Body() dto: SubmitBasicProfileDto) {
    const userId = req.user.id;
    return this.submitBasicProfileUseCase.execute(userId, dto);
  }

  @Post('initiate')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async initiateKycCheck(@Request() req: any) {
    const userId = req.user.id;
    return this.initiateKycCheckUseCase.execute(userId);
  }

  @Get('status')
  @UseGuards(AuthGuard('jwt'))
  async getKycStatus(@Request() req: any) {
    const userId = req.user.id;
    return this.getKycStatusUseCase.execute(userId);
  }

  @Post('webhooks/sumsub')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Headers('x-payload-digest') signatureHeader: string,
    @Req() req: any,
    @Body() body: SumsubWebhookDto,
  ) {
    const rawBody = req.rawBody;
    return this.handleKycWebhookUseCase.execute(rawBody, signatureHeader, body);
  }
}
