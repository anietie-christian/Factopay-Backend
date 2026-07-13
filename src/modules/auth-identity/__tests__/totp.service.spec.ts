import { TotpService } from '../infrastructure/adapters/totp.service';
import { authenticator } from 'otplib';

describe('TotpService', () => {
  let totpService: TotpService;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    totpService = new TotpService();
  });

  it('should generate a secret and a QR code URL', async () => {
    const result = await totpService.generateSecret('test@factopay.com');
    expect(result.secret).toBeDefined();
    expect(result.qrCode).toContain('data:image/png;base64');
  });

  it('should verify a valid TOTP code', async () => {
    const secret = authenticator.generateSecret();
    const token = authenticator.generate(secret);
    
    const isValid = totpService.verifyCode(token, secret);
    expect(isValid).toBe(true);
  });

  it('should encrypt and decrypt the secret correctly', () => {
    const secret = authenticator.generateSecret();
    const encrypted = totpService.encryptSecret(secret);
    const decrypted = totpService.decryptSecret(encrypted);
    
    expect(encrypted).not.toBe(secret);
    expect(decrypted).toBe(secret);
  });
});
