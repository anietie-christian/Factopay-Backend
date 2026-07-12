import { OtpCode } from '../models/otp-code.model';

export const OTP_REPOSITORY_TOKEN = Symbol('OTP_REPOSITORY_TOKEN');

export interface IOtpRepository {
  save(otp: OtpCode): Promise<OtpCode>;
  findLatestValidOtp(userId: string, type: string): Promise<OtpCode | null>;
}
