// ---------------------------------------------------------------------------------------------------------------#*eddiere
export const KYC_PROVIDER_TOKEN = 'IKycProvider';

export interface IKycProvider {
  createVerificationSession(userId: string, email: string): Promise<{ sdkToken: string; externalId: string }>;
}
