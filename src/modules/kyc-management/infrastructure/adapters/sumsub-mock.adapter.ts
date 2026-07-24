// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable } from '@nestjs/common';
import { IKycProvider } from '../../application/ports/kyc-provider.interface';

@Injectable()
export class SumsubMockAdapter implements IKycProvider {
  async createVerificationSession(userId: string, email: string): Promise<{ sdkToken: string; externalId: string }> {
    // Generate a mock SDK session token and external verification tracking ID
    const mockSdkToken = `sb-mock-sdk-token-${userId}-${Date.now()}`;
    const mockExternalId = `sb-mock-ext-id-${userId}-${Date.now()}`;
    return {
      sdkToken: mockSdkToken,
      externalId: mockExternalId,
    };
  }
}
