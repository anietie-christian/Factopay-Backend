// ---------------------------------------------------------------------------------------------------------------#*eddiere
import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';
import * as crypto from 'crypto';
import { getRequiredEnv } from '../../../../config/required-env';

@Injectable()
export class TotpService {
  private readonly algorithm = 'aes-256-cbc';
  
  // Derives a 32-byte key from a dedicated TOTP encryption secret.
  private getEncryptionKey(): Buffer {
    const secret = getRequiredEnv('TOTP_ENCRYPTION_KEY');
    return crypto.createHash('sha256').update(secret).digest();
  }

  /**
   * Generates a new TOTP secret and a corresponding QR code data URL.
   */
  async generateSecret(email: string): Promise<{ secret: string; qrCode: string }> {
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(email, 'FactoPay', secret);
    const qrCode = await qrcode.toDataURL(otpauthUrl);
    
    return {
      secret,
      qrCode,
    };
  }

  /**
   * Verifies a 6-digit TOTP code against a decrypted secret.
   */
  verifyCode(code: string, secret: string): boolean {
    return authenticator.verify({
      token: code,
      secret,
    });
  }

  /**
   * Encrypts the raw secret using AES-256-CBC before saving it to the database.
   */
  encryptSecret(secret: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.getEncryptionKey(), iv);
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    // Prepend IV to ciphertext (hex representation)
    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypts the encrypted secret retrieved from the database.
   */
  decryptSecret(encryptedSecret: string): string {
    const parts = encryptedSecret.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted secret format');
    }
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.getEncryptionKey(), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  }
}
