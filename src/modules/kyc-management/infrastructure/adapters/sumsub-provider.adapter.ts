import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IKycProvider } from '../../application/ports/kyc-provider.interface';
import * as crypto from 'crypto';

@Injectable()
export class SumsubProviderAdapter implements IKycProvider {
  private readonly appToken: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.appToken = this.configService.get<string>('SUMSUB_APP_TOKEN');
    this.secretKey = this.configService.get<string>('SUMSUB_SECRET_KEY');
    this.baseUrl = this.configService.get<string>('SUMSUB_BASE_URL', 'https://api.sumsub.com');
  }

  async createVerificationSession(userId: string, email: string): Promise<{ sdkToken: string; externalId: string }> {
    if (!this.appToken || !this.secretKey) {
      throw new Error('Sumsub app token or secret key is missing in environment variables.');
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = 'POST';
    // Sumsub endpoint for creating an access token for SDK integrations
    const path = `/resources/accessTokens?userId=${encodeURIComponent(userId)}&levelName=basic-kyc-level`;

    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(timestamp + method + path)
      .digest('hex');

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-App-Token': this.appToken,
        'X-App-Access-Sig': signature,
        'X-App-Access-Ts': timestamp,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sumsub API error: ${response.statusText} - ${errorText}`);
    }

    const data = (await response.json()) as { token: string; userId: string };

    return {
      sdkToken: data.token,
      externalId: data.userId,
    };
  }
}
