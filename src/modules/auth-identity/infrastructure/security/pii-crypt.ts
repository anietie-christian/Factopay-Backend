// ---------------------------------------------------------------------------------------------------------------#*eddiere
import * as crypto from 'crypto';
import { getRequiredEnv } from '../../../../config/required-env';

export class PiiCrypt {
  private static readonly ALGORITHM = 'aes-256-gcm';

  private static getKey(): Buffer {
    const key = getRequiredEnv('PII_ENCRYPTION_KEY');
    return crypto.createHash('sha256').update(key).digest();
  }

  private static getBlindIndexSalt(): string {
    return getRequiredEnv('PII_BLIND_INDEX_SALT');
  }

  public static encrypt(text: string | null | undefined): string | null {
    if (!text) return null;
    const key = this.getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${encrypted}:${tag}`;
  }

  public static decrypt(cipherText: string | null | undefined): string | null {
    if (!cipherText) return null;
    const parts = cipherText.split(':');
    if (parts.length !== 3) {
      return cipherText;
    }
    try {
      const iv = Buffer.from(parts[0], 'hex');
      const encryptedText = parts[1];
      const tag = Buffer.from(parts[2], 'hex');
      const key = this.getKey();

      const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (e) {
      return cipherText;
    }
  }

  public static generateBlindIndex(text: string | null | undefined): string | null {
    if (!text) return null;
    const salt = this.getBlindIndexSalt();
    return crypto
      .createHmac('sha256', salt)
      .update(text)
      .digest('hex');
  }
}
